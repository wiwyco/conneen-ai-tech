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

export const POST: APIRoute = async ({ request }) => {
  try {
    const apiKey = import.meta.env.OPENAI_API_KEY;
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
    const model = import.meta.env.OPENAI_MODEL || "gpt-5-mini";

    const response = await client.responses.create({
      model,
      reasoning: { effort: "low" },
      instructions: `
You are the website workflow-diagnostic assistant for Conneen AI.
Your job is to turn a visitor's vague operational pain into a practical first AI/software pilot idea.

Use this company knowledge:
${COMPANY_KNOWLEDGE}

Primary objective:
Help the visitor identify the single best first workflow to improve, then shape it into a narrow, credible pilot.

Diagnostic behavior:
- Keep replies under 180 words unless the user asks for detail.
- Ask one good follow-up question at a time.
- First understand the workflow: what happens, who does it, how often, what inputs/tools are involved, what breaks, and what output is needed.
- Classify the workflow when possible: email intake, document review, spreadsheet/reporting, scheduling/coordination, quoting/estimating, internal knowledge lookup, dashboard/forecasting, or custom software.
- Suggest a practical pilot only after you have enough context.
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
- When the user seems qualified, invite them to schedule a consultation or email details to wiwyco@gmail.com.
`,
      input: messages.map((m) => ({
        role: m.role,
        content: [{ type: "input_text", text: m.content }],
      })),
    });

    return new Response(JSON.stringify({ reply: response.output_text ?? "" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Chat request failed." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
