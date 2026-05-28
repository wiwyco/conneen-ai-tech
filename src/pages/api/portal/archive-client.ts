import type { APIRoute } from "astro";
import { requirePortalAuth } from "../../../lib/portal/auth";
import { logAudit } from "../../../lib/portal/activity";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { eq, updateRows } from "../../../lib/portal/supabase";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    if (!auth.isAdmin) return jsonResponse({ error: "Admin access required." }, 403);
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const clientId = cleanText(body.clientId, 80);
    if (!clientId) return jsonResponse({ error: "Client id is required." }, 400);

    const [client] = await updateRows("portal_clients", { id: eq(clientId) }, {
      status: "archived",
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await logAudit(auth, "archive", "portal_clients", clientId, clientId);
    return jsonResponse({ client });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Archive failed." }, 500);
  }
};
