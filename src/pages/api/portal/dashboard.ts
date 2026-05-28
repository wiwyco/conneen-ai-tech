import type { APIRoute } from "astro";
import { canAccessClient, requirePortalAuth } from "../../../lib/portal/auth";
import { getClientDashboard } from "../../../lib/portal/analytics";
import { cleanText, jsonResponse } from "../../../lib/portal/http";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const auth = await requirePortalAuth(request);
    const requestedClientId = cleanText(url.searchParams.get("clientId"), 80);
    const clientId = requestedClientId || auth.clientId;
    if (!clientId) return jsonResponse({ error: "A client workspace is required." }, 400);
    if (!canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);
    return jsonResponse(await getClientDashboard(clientId, auth.isAdmin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dashboard failed.";
    return jsonResponse({ error: message }, message === "Authentication required." ? 401 : 500);
  }
};
