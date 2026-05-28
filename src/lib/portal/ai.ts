import OpenAI from "openai";
import { getEnv } from "./env";
import { eq, insertRow, selectRows } from "./supabase";
import { ADMIN_PORTAL_SECTIONS, getSectionConfig } from "./tables";

export async function getClientContext(clientId: string) {
  const client = await selectRows<any>("portal_clients", { id: eq(clientId), limit: 1 });
  const sectionEntries = await Promise.all(
    ADMIN_PORTAL_SECTIONS.map(async (section) => {
      const config = getSectionConfig(section);
      if (!config?.clientScoped) return [section, []] as const;
      const rows = await selectRows<any>(config.table, {
        client_id: eq(clientId),
        select: "*",
        order: "created_at.desc",
        limit: 40,
      }).catch(() => []);
      return [section, rows] as const;
    })
  );

  return {
    client: client[0] || null,
    sections: Object.fromEntries(sectionEntries),
  };
}

function compactContext(context: Awaited<ReturnType<typeof getClientContext>>, includeInternal: boolean) {
  const visible = (rows: any[]) =>
    includeInternal ? rows : rows.filter((row) => row.visibility !== "internal");

  const sections = Object.fromEntries(
    Object.entries(context.sections).map(([key, rows]) => [key, visible(rows as any[])])
  );

  return JSON.stringify(
    {
      client: context.client,
      sections,
    },
    null,
    2
  ).slice(0, 24000);
}

export async function runPortalAi({
  clientId,
  mode,
  prompt,
  includeInternal,
}: {
  clientId: string;
  mode: string;
  prompt: string;
  includeInternal: boolean;
}) {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for portal AI features.");

  const client = new OpenAI({ apiKey });
  const model = getEnv("OPENAI_MODEL") || "gpt-5-mini";
  const context = await getClientContext(clientId);
  const contextText = compactContext(context, includeInternal);

  const response = await client.responses.create({
    model,
    reasoning: { effort: "low" },
    instructions: `
You are the logged-in client-portal version of Scout for Conneen AI.
Use only the portal context provided. If the answer is not in the context, say what is missing.
Be concise, practical, and careful with private information.

Mode: ${mode}

For summary/update/email/scope/meeting-prep modes, produce a useful draft.
For client Q&A, answer from the client's documents, notes, workflows, and business knowledge.
For readiness or health scoring, give a 1-10 score with the main reasons and next actions.
`,
    input: `Portal context:\n${contextText}\n\nUser request:\n${prompt}`,
  });

  return response.output_text?.trim() || "";
}

export async function saveGeneratedKnowledge(clientId: string, title: string, content: string) {
  return insertRow("portal_business_knowledge", {
    client_id: clientId,
    title,
    category: "generated summary",
    content,
    source_type: "portal_ai",
    visibility: "internal",
  });
}
