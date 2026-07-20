import type { APIRoute } from "astro";
import { provisionPortalFromLead } from "../../lib/portal/provisioning";
import { verifyLeadCaptcha } from "../../lib/portal/captcha";
import { enforceRateLimit, RATE_LIMITS } from "../../lib/portal/rate-limit";

export const prerender = false;

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

type LeadRequest = {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  phone?: unknown;
  workflow?: unknown;
  source?: unknown;
  messages?: unknown;
  pagePath?: unknown;
  captchaToken?: unknown;
  turnstileToken?: unknown;
  "cf-turnstile-response"?: unknown;
};

const MAX_MESSAGES = 18;
const MAX_MESSAGE_CHARS = 2200;
const EMAIL_TIMEOUT_MS = 8000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_LEAD_ERROR =
  "I could not save the diagnostic brief right now. Please email winslow@conneenai.tech directly.";

function getEnv(name: string): string | undefined {
  return import.meta.env[name] || process.env[name];
}

function cleanText(value: unknown, max = 400): string | null {
  if (typeof value !== "string") return null;

  const text = value.trim().slice(0, max);
  return text || null;
}

function cleanMessages(value: unknown): ClientMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((m): m is ClientMessage => {
      return (
        m &&
        typeof m === "object" &&
        ((m as any).role === "user" || (m as any).role === "assistant") &&
        typeof (m as any).content === "string"
      );
    })
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((m) => m.content);
}

function messagesFromSiteLead(body: LeadRequest | null): ClientMessage[] {
  const workflow = cleanText(body?.workflow, MAX_MESSAGE_CHARS);

  if (!workflow) return [];

  return [
    {
      role: "user",
      content: workflow,
    },
  ];
}

function classifyWorkflow(messages: ClientMessage[]): string {
  const text = messages.map((m) => m.content).join(" ").toLowerCase();
  const categories = [
    ["email intake", ["email", "inbox", "reply", "request"]],
    ["document review", ["pdf", "document", "contract", "file", "extract", "summarize"]],
    ["spreadsheet/reporting", ["spreadsheet", "excel", "sheet", "report", "dashboard", "reconcile"]],
    ["scheduling/coordination", ["schedule", "dispatch", "calendar", "coordinate", "follow-up"]],
    ["quoting/estimating", ["quote", "estimate", "proposal", "bid", "pricing"]],
    ["internal knowledge lookup", ["sop", "policy", "knowledge", "manual", "procedure"]],
    ["dashboard/forecasting", ["forecast", "predict", "trend", "metric", "analytics"]],
  ] as const;

  const match = categories.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)));
  return match?.[0] || "custom software";
}

function buildDiagnosticSummary(messages: ClientMessage[], workflowType: string) {
  const userMessages = messages.filter((m) => m.role === "user").map((m) => m.content);
  const assistantMessages = messages.filter((m) => m.role === "assistant").map((m) => m.content);
  const workflowDescription = userMessages[0] || "Workflow diagnostic submitted from the chatbot.";
  const latestAssistantSummary = assistantMessages.at(-1) || "";

  return {
    workflowType,
    workflowDescription,
    latestAssistantSummary,
    suggestedNextStep: "Review the workflow diagnostic and follow up for a process mapping call.",
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTranscript(messages: ClientMessage[]): string {
  return messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");
}

async function insertLead(payload: Record<string, unknown>) {
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseKey = getEnv("SUPABASE_SECRET_KEY") || getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase server environment variables are missing.");
  }

  let leadUrl: URL;
  try {
    leadUrl = new URL("/rest/v1/diagnostic_leads", supabaseUrl.replace(/\/$/, ""));
  } catch {
    throw new Error("SUPABASE_URL is invalid. It must include the full https:// project URL.");
  }

  let response: Response;
  try {
    response = await fetch(leadUrl, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Supabase lead insert request failed:", error);
    throw new Error("Lead database is temporarily unreachable.");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("Supabase lead insert failed:", response.status, text);

    if (response.status === 404 && text.includes("diagnostic_leads")) {
      throw new Error("Supabase table diagnostic_leads is missing. Run supabase/diagnostic_leads.sql in the Supabase SQL editor, then retry.");
    }

    throw new Error("Lead database insert failed.");
  }

  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

async function sendLeadEmail({
  lead,
  transcript,
  portalProvision,
}: {
  lead: Record<string, any>;
  transcript: string;
  portalProvision?: Record<string, any> | null;
}): Promise<boolean> {
  const resendApiKey = getEnv("RESEND_API_KEY");
  const to = getEnv("LEAD_NOTIFY_EMAIL") || "winslow@conneenai.tech";
  const from = getEnv("LEAD_FROM_EMAIL");

  if (!resendApiKey || !from) {
    console.warn("Lead email skipped: RESEND_API_KEY or LEAD_FROM_EMAIL is missing.");
    return false;
  }

  const subject = `New AI pilot diagnostic: ${lead.workflow_type || "workflow lead"}`;
  const summary = lead.diagnostic_summary || {};

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h2>New Conneen AI diagnostic lead</h2>
      <p><strong>Name:</strong> ${escapeHtml(lead.name || "Not provided")}</p>
      <p><strong>Email:</strong> ${escapeHtml(lead.email)}</p>
      <p><strong>Company:</strong> ${escapeHtml(lead.company || "Not provided")}</p>
      <p><strong>Phone:</strong> ${escapeHtml(lead.phone || "Not provided")}</p>
      <p><strong>Workflow type:</strong> ${escapeHtml(lead.workflow_type || "Not classified")}</p>
      <p><strong>Workflow summary:</strong><br>${escapeHtml(lead.workflow_summary || "")}</p>
      <p><strong>Latest diagnostic guidance:</strong><br>${escapeHtml(summary.latestAssistantSummary || "")}</p>
      ${
        portalProvision
          ? `<h3>Portal workspace</h3>
             <p><strong>Client ID:</strong> ${escapeHtml(portalProvision.clientId || "")}</p>
             <p><strong>Project ID:</strong> ${escapeHtml(portalProvision.projectId || "Not created")}</p>
             <p><strong>Invite sent:</strong> ${portalProvision.inviteEmailSent ? "Yes" : "No"}</p>
             <p><strong>Invite link returned in API:</strong> ${portalProvision.inviteUrl ? "Yes (development/local mode)" : "No"}</p>`
          : ""
      }
      <h3>Transcript</h3>
      <pre style="white-space:pre-wrap;background:#f5f5f5;padding:16px;border:1px solid #ddd">${escapeHtml(transcript)}</pre>
    </div>
  `;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        reply_to: lead.email,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("Resend lead email failed:", response.status, text);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Resend lead email failed:", error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json().catch(() => null)) as LeadRequest | null;
    const email = cleanText(body?.email, 320)?.toLowerCase();

    if (!email || !EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ error: "A valid email is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const limited = await enforceRateLimit({
      request,
      route: "lead_capture",
      subject: email,
      ...RATE_LIMITS.lead,
    });
    if (limited) return limited;

    const captchaToken =
      cleanText(body?.captchaToken, 4096) ||
      cleanText(body?.turnstileToken, 4096) ||
      cleanText(body?.["cf-turnstile-response"], 4096);
    const captcha = await verifyLeadCaptcha({ token: captchaToken, request });
    if (!captcha.ok) {
      return new Response(JSON.stringify({ error: captcha.error }), {
        status: captcha.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const messages = cleanMessages(body?.messages);
    const workflow = cleanText(body?.workflow, MAX_MESSAGE_CHARS);
    const siteMessages = messages.length
      ? [
          ...messages,
          ...(workflow
            ? [
                {
                  role: "user" as const,
                  content: `Submitted workflow brief: ${workflow}`,
                },
              ]
            : []),
        ]
      : messagesFromSiteLead(body);

    if (!siteMessages.length) {
      return new Response(JSON.stringify({ error: "A workflow description is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const workflowType = classifyWorkflow(siteMessages);
    const diagnosticSummary = buildDiagnosticSummary(siteMessages, workflowType);
    const transcript = formatTranscript(siteMessages);

    const leadPayload = {
      status: "new",
      source: cleanText(body?.source, 80) || "workflow_diagnostic",
      name: cleanText(body?.name),
      email,
      company: cleanText(body?.company),
      phone: cleanText(body?.phone, 80),
      workflow_type: workflowType,
      workflow_summary: diagnosticSummary.workflowDescription,
      diagnostic_summary: diagnosticSummary,
      transcript: siteMessages,
      user_agent: request.headers.get("user-agent"),
      page_path: cleanText(body?.pagePath, 500),
    };

    let lead: Record<string, any> | null = null;
    let leadStorageError: string | null = null;
    let portalProvision: Record<string, any> | null = null;
    let portalProvisionError: string | null = null;

    try {
      lead = await insertLead(leadPayload);
    } catch (error) {
      leadStorageError = error instanceof Error ? error.message : "Lead database insert failed.";
      console.error("Lead storage failed:", error);
    }

    if (lead) {
      try {
        portalProvision = await provisionPortalFromLead({
          ...lead,
          transcript: siteMessages,
        } as any);
      } catch (error) {
        portalProvisionError = error instanceof Error ? error.message : "Portal provisioning failed.";
        console.error("Portal provisioning failed:", error);
      }
    } else {
      portalProvisionError = "Portal provisioning skipped because the lead was not saved to the database.";
    }

    const emailSent = await sendLeadEmail({ lead: lead || leadPayload, transcript, portalProvision });

    if (!lead && !emailSent) {
      return new Response(JSON.stringify({ error: PUBLIC_LEAD_ERROR, leadStorageError }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      leadId: lead?.id,
      emailSent,
      portalProvision,
      portalProvisionError,
      leadStorageError,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({
        error: PUBLIC_LEAD_ERROR,
      }),
      {
      status: 500,
      headers: { "Content-Type": "application/json" },
      }
    );
  }
};
