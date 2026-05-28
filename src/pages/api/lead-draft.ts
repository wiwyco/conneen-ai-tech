import type { APIRoute } from "astro";
import OpenAI from "openai";

export const prerender = false;

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_MESSAGES = 14;
const MAX_MESSAGE_CHARS = 1600;

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
      content: m.content.trim().slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((m) => m.content);
}

function fallbackDraft(messages: ClientMessage[]) {
  const firstUserMessage =
    messages.find((m) => m.role === "user")?.content ||
    "We have a repetitive workflow that may be a good AI/software pilot.";

  return {
    name: "",
    email: "",
    company: "",
    workflow:
      `Workflow brief: ${firstUserMessage}\n\n` +
      "Likely first step: map the current inputs, outputs, tools, handoffs, and review points.\n\n" +
      "Human review: keep a person in control of approvals and high-impact decisions.\n\n" +
      "Desired next step: process mapping call with Conneen AI.",
  };
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const messages = cleanMessages(body?.messages);

  if (!messages.length) {
    return new Response(JSON.stringify({ error: "A diagnostic transcript is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify(fallbackDraft(messages)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const client = new OpenAI({ apiKey });
    const model = getEnv("OPENAI_MODEL") || "gpt-5-mini";

    const response = await client.responses.create({
      model,
      reasoning: { effort: "low" },
      instructions: `
You are Scout, Conneen AI's workflow guide. Draft concise lead-capture fields for Conneen AI based on a workflow diagnostic chat.
Return only valid JSON with this shape:
{"name":"","email":"","company":"","workflow":"..."}

Rules:
- Fill name, email, and company only if the user explicitly provided them.
- Leave unknown fields as empty strings.
- The workflow field should be 120-220 words and include:
- the workflow pain
- tools/data mentioned
- likely pilot idea
- human review point
- useful next step
- Use plain, professional language that focuses on business relief, not AI hype.

Do not invent precise numbers, names, or tools that were not provided.
Do not add pricing unless the user explicitly discussed pricing. If pricing is included, keep it as a rough planning estimate requiring Conneen AI review and approval.
`,
      input: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const text = response.output_text || "";
    const parsed = JSON.parse(text) as {
      name?: unknown;
      email?: unknown;
      company?: unknown;
      workflow?: unknown;
    };
    const workflow = typeof parsed.workflow === "string" ? parsed.workflow.trim() : "";

    if (!workflow) throw new Error("Missing workflow draft.");

    return new Response(
      JSON.stringify({
        name: typeof parsed.name === "string" ? parsed.name.trim() : "",
        email: typeof parsed.email === "string" ? parsed.email.trim() : "",
        company: typeof parsed.company === "string" ? parsed.company.trim() : "",
        workflow,
      }),
      {
      status: 200,
      headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify(fallbackDraft(messages)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
