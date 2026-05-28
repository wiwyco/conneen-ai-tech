import OpenAI from "openai";
import type { APIRoute } from "astro";
import { canAccessClient, requirePortalAuth } from "../../../lib/portal/auth";
import { logAudit, logTimeline } from "../../../lib/portal/activity";
import { getEnv } from "../../../lib/portal/env";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { insertRow } from "../../../lib/portal/supabase";

export const prerender = false;

type ScoutMessage = {
  role: "user" | "assistant";
  content: string;
};

type ProjectPlan = {
  project: {
    name: string;
    scope: string;
    goals: string;
    deliverables: string;
    target_date?: string | null;
  };
  milestones: Array<{ name: string; stage?: string; status?: string; notes?: string; due_date?: string | null }>;
  estimate: { title: string; hour_range_low?: number; hour_range_high?: number; assumptions?: string };
  payment: { title: string; amount?: number | null; notes?: string; due_date?: string | null };
  invoice: { invoice_number?: string; amount?: number | null; status?: string; notes?: string; due_date?: string | null };
  contract: { title: string; contract_type?: string; status?: string; notes?: string };
};

function cleanMessages(value: unknown): ScoutMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message): message is ScoutMessage => {
      return (
        message &&
        typeof message === "object" &&
        ((message as any).role === "user" || (message as any).role === "assistant") &&
        typeof (message as any).content === "string"
      );
    })
    .slice(-16)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 2500),
    }))
    .filter((message) => message.content);
}

function transcript(messages: ScoutMessage[]) {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
}

function fallbackPlan(messages: ScoutMessage[]): ProjectPlan {
  const userText = messages.filter((message) => message.role === "user").map((message) => message.content).join("\n\n");
  const firstLine = userText.split(/\n|\.|;/).map((part) => part.trim()).find(Boolean) || "New client project";
  const name = firstLine.length > 76 ? `${firstLine.slice(0, 73)}...` : firstLine;

  return {
    project: {
      name,
      scope: userText || "Project scope captured by Scout.",
      goals: "Confirm desired business outcome, success metrics, and delivery constraints.",
      deliverables: "Discovery summary, implementation plan, working pilot, review session, and handoff notes.",
      target_date: null,
    },
    milestones: [
      { name: "Discovery complete", stage: "discovery", status: "not started", notes: "Confirm workflow, users, data, risks, and success metrics." },
      { name: "Project plan approved", stage: "planning", status: "not started", notes: "Review scope, estimate, milestones, and human approval points." },
      { name: "Prototype ready", stage: "build", status: "not started", notes: "Prepare first usable version for feedback." },
      { name: "Live test started", stage: "validation", status: "not started", notes: "Test with real workflow data and track results." },
      { name: "Training and handoff complete", stage: "handoff", status: "not started", notes: "Document usage, maintenance, and next steps." },
    ],
    estimate: {
      title: "Initial planning estimate",
      hour_range_low: 20,
      hour_range_high: 40,
      assumptions: "Rough planning estimate at $150/hr. Requires Conneen AI review and approval before it is treated as a quote.",
    },
    payment: {
      title: "Initial milestone payment",
      amount: null,
      notes: "Milestone payment placeholder. Amount should be confirmed after scope and estimate approval.",
    },
    invoice: {
      invoice_number: "Draft",
      amount: null,
      status: "draft",
      notes: "Draft invoice placeholder pending approved scope, estimate, and milestone payment schedule.",
    },
    contract: {
      title: "Draft SOW",
      contract_type: "SOW",
      status: "draft",
      notes: "Draft statement of work placeholder pending Conneen AI review.",
    },
  };
}

function safeJson(text: string): ProjectPlan | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function buildPlan(messages: ScoutMessage[]): Promise<ProjectPlan> {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) return fallbackPlan(messages);

  const client = new OpenAI({ apiKey });
  const model = getEnv("OPENAI_MODEL") || "gpt-5-mini";
  const response = await client.responses.create({
    model,
    reasoning: { effort: "low" },
    instructions: `
You are Scout inside the Conneen AI client portal. Convert the project setup conversation into JSON only.
Use conservative placeholders when details are missing. Never invent approved prices.
Estimates are rough planning ranges at $150/hr and must require Conneen AI review/approval.
Return:
{
  "project": {"name":"","scope":"","goals":"","deliverables":"","target_date": null},
  "milestones": [{"name":"","stage":"discovery|planning|build|validation|handoff","status":"not started","notes":"","due_date": null}],
  "estimate": {"title":"Initial planning estimate","hour_range_low":20,"hour_range_high":40,"assumptions":""},
  "payment": {"title":"Initial milestone payment","amount": null,"notes":"","due_date": null},
  "invoice": {"invoice_number":"Draft","amount": null,"status":"draft","notes":"","due_date": null},
  "contract": {"title":"Draft SOW","contract_type":"SOW","status":"draft","notes":""}
}
`,
    input: transcript(messages),
  });

  return safeJson(response.output_text || "") || fallbackPlan(messages);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const clientId = cleanText(body.clientId, 80) || auth.clientId || "";
    const action = cleanText(body.action, 40) || "chat";
    const messages = cleanMessages(body.messages);

    if (!clientId || !canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);
    if (!messages.length) return jsonResponse({ error: "Scout needs a project description first." }, 400);

    if (action !== "create") {
      return jsonResponse({
        reply:
          "Got it. Tell me the outcome you want, who will use it, any must-have deliverables, target timing, and what would make the project feel successful. When the basics are there, I can create the project workspace.",
      });
    }

    const plan = await buildPlan(messages);
    const project = await insertRow<any>("portal_projects", {
      client_id: clientId,
      name: cleanText(plan.project?.name, 240) || "New client project",
      scope: cleanText(plan.project?.scope, 8000) || null,
      goals: cleanText(plan.project?.goals, 8000) || null,
      deliverables: cleanText(plan.project?.deliverables, 8000) || null,
      target_date: cleanText(plan.project?.target_date, 40) || null,
      agile_stage: "discovery",
      status: "active",
      visibility: "shared",
    });

    const milestones = [];
    for (const milestone of (plan.milestones || []).slice(0, 8)) {
      milestones.push(
        await insertRow<any>("portal_milestones", {
          client_id: clientId,
          project_id: project.id,
          name: cleanText(milestone.name, 240) || "Project milestone",
          stage: cleanText(milestone.stage, 80) || "discovery",
          status: cleanText(milestone.status, 80) || "not started",
          due_date: cleanText(milestone.due_date, 40) || null,
          notes: cleanText(milestone.notes, 4000) || null,
        })
      );
    }

    const estimate = await insertRow<any>("portal_estimates", {
      client_id: clientId,
      project_id: project.id,
      title: cleanText(plan.estimate?.title, 240) || "Initial planning estimate",
      estimate_type: "planning estimate",
      hourly_rate: 150,
      hour_range_low: Number(plan.estimate?.hour_range_low) || null,
      hour_range_high: Number(plan.estimate?.hour_range_high) || null,
      assumptions:
        cleanText(plan.estimate?.assumptions, 4000) ||
        "Rough planning estimate at $150/hr. Requires Conneen AI review and approval.",
      approval_status: "draft",
    });

    const payment = await insertRow<any>("portal_payments", {
      client_id: clientId,
      project_id: project.id,
      title: cleanText(plan.payment?.title, 240) || "Initial milestone payment",
      amount: Number(plan.payment?.amount) || null,
      status: "planned",
      due_date: cleanText(plan.payment?.due_date, 40) || null,
      notes: cleanText(plan.payment?.notes, 4000) || "Placeholder pending approved scope and estimate.",
      visibility: "shared",
    });

    const invoice = await insertRow<any>("portal_invoices", {
      client_id: clientId,
      project_id: project.id,
      invoice_number: cleanText(plan.invoice?.invoice_number, 120) || "Draft",
      amount: Number(plan.invoice?.amount) || null,
      status: cleanText(plan.invoice?.status, 80) || "draft",
      due_date: cleanText(plan.invoice?.due_date, 40) || null,
      notes: cleanText(plan.invoice?.notes, 4000) || "Draft invoice placeholder.",
    });

    const contract = await insertRow<any>("portal_contracts", {
      client_id: clientId,
      project_id: project.id,
      title: cleanText(plan.contract?.title, 240) || "Draft SOW",
      contract_type: cleanText(plan.contract?.contract_type, 80) || "SOW",
      status: cleanText(plan.contract?.status, 80) || "draft",
      notes: cleanText(plan.contract?.notes, 4000) || "Draft SOW placeholder.",
    });

    await logAudit(auth, "project_scout_create", "portal_projects", project.id, clientId);
    await logTimeline(clientId, `Scout created project: ${project.name}`, {
      auth,
      eventType: "project_created",
      sourceTable: "portal_projects",
      sourceId: project.id,
      visibility: "shared",
    });

    return jsonResponse({ project, milestones, estimate, payment, invoice, contract });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Project Scout failed." }, 500);
  }
};
