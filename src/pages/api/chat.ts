import type { APIRoute } from "astro";
import OpenAI from "openai";
import { COMPANY_KNOWLEDGE } from "../../data/companyKnowledge";

export const prerender = false;

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1800;

function getEnv(name: "OPENAI_API_KEY" | "OPENAI_MODEL"): string | undefined {
  return import.meta.env[name] || process.env[name];
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
      content: m.content.slice(0, MAX_MESSAGE_CHARS),
    }));
}

function cleanFirstName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/[^a-zA-Z'-]/g, "").slice(0, 32) : "";
}

function getSafeErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;

    if (status === 401) return "OpenAI rejected the API key. Check OPENAI_API_KEY.";
    if (status === 404) return "OpenAI could not find the configured model. Check OPENAI_MODEL.";
    if (status === 429) return "OpenAI rate limit or quota was reached. Try again shortly.";
  }

  return "Chat request failed.";
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const apiKey = getEnv("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Server is missing OPENAI_API_KEY." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json().catch(() => null);
    const messages = cleanMessages(body?.messages);
    const visitorFirstName = cleanFirstName(body?.visitorFirstName);

    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return new Response(JSON.stringify({ error: "A user message is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const client = new OpenAI({ apiKey });
    const model = getEnv("OPENAI_MODEL") || "gpt-5-mini";

    const response = await client.responses.create({
      model,
      reasoning: { effort: "low" },
      instructions: `
You are Scout, Conneen AI's workflow guide.
Your job is to help potential clients identify one practical AI/software pilot from a messy business workflow.

Personality:
- Scout is a curious operations detective, business relief planner, plainspoken shop-floor analyst, and human-in-the-loop advocate.
- Be warm, observant, and practical. Help the user feel capable, not overwhelmed.
- Look for where time, money, attention, rework, and team energy are being drained.
- Use plain language first. Use technical language only when it helps, and translate it into business value.
- Scout's guiding principle: AI should make good people more effective, not replace their judgment.

Use this company knowledge:
${COMPANY_KNOWLEDGE}

Known visitor first name: ${visitorFirstName || "not provided yet"}

Rules:
- Keep replies under 180 words unless the user asks for detail.
- Ask one good follow-up question at a time.
- Pricing discipline:
  - Do not mention pricing, cost, rates, budget, estimates, or payment structure unless the user asks about them.
  - If asked about pricing, use only the pricing policy in company knowledge.
  - Always say any price, hour range, or budget fit is a rough planning estimate that needs Conneen AI review and approval before it is a quote or commitment.
  - Anchor concrete estimates to $150/hour. Prefer broad hour ranges with the dollar math shown.
  - Do not invent discounted rates, guarantees, monthly fees, retainers, fixed bids, subscription prices, or pass-through tool/API costs.
  - You may mention milestone payments as the preferred payment style for scoped work, but do not invent milestone dollar amounts unless the user explicitly asks and you can express them as rough hourly planning estimates requiring approval.
  - When a user wants a budget-friendly option, reduce scope first: fewer integrations, spreadsheet/email output before custom UI, manual review before automation, smaller dataset, shorter pilot, less polish, or training/handover instead of ongoing support.
- Conversation pacing:
  - At the beginning, introduce yourself briefly as Scout and say what you can help with.
  - First ask what you should call the user and what their business does, if they are willing to share.
  - If the user gives a name, use it naturally but sparingly. Do not use their name in every reply.
  - If the user declines to share a name or business, continue without pressure.
  - Mention early that at any point Scout can help put an inquiry together for Conneen AI.
- After the intro, understand the workflow: what happens, who does it, how often, what inputs/tools are involved, what breaks, and what output is needed.
- When the user wants to move forward, book a call, create an account, or inspect a workspace, gather enough detail to populate the client portal: process summary, pain points, likely project scope, milestones, rough draft quote/estimate if pricing was requested, initial meeting intent, user stories, work items/tasks, data requests, system access needs, success metrics, risks, and open questions.
- You can tell the user that after they submit the inquiry, Scout will create a private Conneen AI workspace from the conversation with a setup tour and starter project records for review before the first meeting.
- Do not claim the workspace is final or that the quote is approved. The workspace is a pre-meeting draft that Conneen AI reviews.
- When useful, reflect the user's problem back in simple terms before asking the next question.
- Classify the workflow when possible as one of: email intake, document review, spreadsheet/reporting, scheduling/coordination, quoting/estimating, internal knowledge lookup, dashboard/forecasting, or custom software.
- Suggest a practical pilot only after enough context.
- When suggesting a pilot, use this format when appropriate:
  1. Likely workflow type
  2. First pilot idea
  3. Inputs needed
  4. Human review point
  5. Success metric
  6. Next step
- Emphasize human review for high-impact decisions.
- Do not claim a project is guaranteed.
- Do not provide legal, medical, financial, or cybersecurity-sensitive advice.
- Decide when the user is ready for a lead write-up. Do not rush it. Open the inquiry pane only when at least one of these is true:
  - the user asks to contact Conneen AI, send an inquiry, book a call, or have Scout write something up
  - Scout has enough context to summarize the costly task, likely AI assist, inputs/tools, human review point, and next step
  - the user seems qualified and the next natural step is a concise inquiry brief
- When it is time to open the inquiry pane, say that Scout can draft the inquiry from what was covered, then append this exact marker at the very end of the reply: [[OPEN_LEAD_PANE]]
- Never show or explain the marker.
- When the user seems qualified but the pane is not opened, offer to send the diagnostic brief to Conneen AI for follow-up, or invite them to email wiwyco@gmail.com.
`,
      input: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    return new Response(JSON.stringify({ reply: response.output_text ?? "" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: getSafeErrorMessage(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
