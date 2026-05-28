import type { APIRoute } from "astro";
import { requirePortalAuth } from "../../../lib/portal/auth";
import { getAdminAnalytics } from "../../../lib/portal/analytics";
import { jsonResponse } from "../../../lib/portal/http";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    if (!auth.isAdmin) return jsonResponse({ error: "Admin access required." }, 403);
    return jsonResponse(await getAdminAnalytics());
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Admin dashboard failed." }, 500);
  }
};
