import type { APIRoute } from "astro";
import OpenAI from "openai";

export const prerender = false;

function getEnv(name: "OPENAI_API_KEY" | "OPENAI_MODEL"): string | undefined {
  return import.meta.env[name] || process.env[name];
}

function cleanText(value: unknown, max = 1200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function fallbackMessage(name: string, workflow: string): string {
  const greeting = name ? `Thank you, ${name}.` : "Thank you.";
  const detail = workflow
    ? "Your workflow brief is saved, and Conneen AI will review it for a practical first pilot."
    : "Your diagnostic brief is saved, and Conneen AI will review it for a practical first pilot.";

  return `${greeting} ${detail}`;
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const name = cleanText(body?.name, 80);
  const workflow = cleanText(body?.workflow);
  const apiKey = getEnv("OPENAI_API_KEY");

  if (!apiKey) {
    return new Response(JSON.stringify({ message: fallbackMessage(name, workflow) }), {
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
Write a polished thank-you message for a Conneen AI lead who submitted a workflow diagnostic.
Keep it under 38 words. Be calm, specific, and professional.
Mention that the brief was received and Conneen AI will review the first pilot opportunity.
Do not promise a project or outcome.
`,
      input: `Name: ${name || "not provided"}\nWorkflow brief: ${workflow || "not provided"}`,
    });

    const message = response.output_text?.trim() || fallbackMessage(name, workflow);

    return new Response(JSON.stringify({ message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: fallbackMessage(name, workflow) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
