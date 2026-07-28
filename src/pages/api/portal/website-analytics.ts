import type { APIRoute } from "astro";
import { requirePortalAuth } from "../../../lib/portal/auth";
import { cleanText, jsonResponse } from "../../../lib/portal/http";
import { getWebsiteUsageAnalytics } from "../../../lib/portal/websiteAnalytics";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const auth = await requirePortalAuth(request);
    if (!auth.isAdmin) return jsonResponse({ error: "Admin access required." }, 403);

    const days = Number(cleanText(url.searchParams.get("days"), 12) || 30);
    return jsonResponse(await getWebsiteUsageAnalytics(Number.isFinite(days) ? days : 30));
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Website analytics failed." }, 500);
  }
};
