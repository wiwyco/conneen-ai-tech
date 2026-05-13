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
You are Conneen AI's workflow diagnostic assistant.
Your job is to help potential clients identify one practical AI/software pilot from a messy business workflow.

Use this company knowledge:
${COMPANY_KNOWLEDGE}

Rules:
- Keep replies under 180 words unless the user asks for detail.
- Ask one good follow-up question at a time.
- First understand the workflow: what happens, who does it, how often, what inputs/tools are involved, what breaks, and what output is needed.
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
- When the user seems qualified, invite them to schedule a consultation or email wiwyco@gmail.com.
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
