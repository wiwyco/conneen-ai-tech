import type { APIRoute } from "astro";
import { canAccessClient, requirePortalAuth } from "../../../lib/portal/auth";
import { logAudit } from "../../../lib/portal/activity";
import { runPortalAi, saveGeneratedKnowledge } from "../../../lib/portal/ai";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { canPortalAction } from "../../../lib/portal/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../../../lib/portal/rate-limit";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const clientId = cleanText(body.clientId, 80) || auth.clientId || "";
    if (!clientId || !canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);
    if (!await canPortalAction(auth, { section: "projects", action: "read", clientId })) {
      return jsonResponse({ error: "Forbidden." }, 403);
    }

    const mode = cleanText(body.mode, 80) || "client_qa";
    const prompt = cleanText(body.prompt, 4000);
    const save = body.save === true;
    if (!prompt) return jsonResponse({ error: "Prompt is required." }, 400);
    const limited = await enforceRateLimit({
      request,
      route: "portal_ai",
      subject: `${auth.user.id}:${clientId}:${mode}`,
      ...RATE_LIMITS.portalAi,
    });
    if (limited) return limited;

    const text = await runPortalAi({
      clientId,
      mode,
      prompt,
      includeInternal: auth.isAdmin,
    });

    let saved = null;
    if (save && auth.isAdmin) {
      saved = await saveGeneratedKnowledge(clientId, `Generated ${mode}`, text);
    }
    await logAudit(auth, `portal_ai_${mode}`, "portal_clients", clientId, clientId, { prompt: prompt.slice(0, 500) });

    return jsonResponse({ text, saved });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Portal AI failed." }, 500);
  }
};
