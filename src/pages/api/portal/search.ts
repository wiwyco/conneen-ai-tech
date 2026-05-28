import type { APIRoute } from "astro";
import { canAccessClient, requirePortalAuth } from "../../../lib/portal/auth";
import { cleanText, jsonResponse } from "../../../lib/portal/http";
import { ADMIN_PORTAL_SECTIONS, getSectionConfig } from "../../../lib/portal/tables";
import { eq, selectRows } from "../../../lib/portal/supabase";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const auth = await requirePortalAuth(request);
    const clientId = cleanText(url.searchParams.get("clientId"), 80) || auth.clientId || "";
    const q = cleanText(url.searchParams.get("q"), 200).toLowerCase();
    if (!clientId || !canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);
    if (!q) return jsonResponse({ results: [] });

    const results: any[] = [];
    for (const section of ADMIN_PORTAL_SECTIONS) {
      const config = getSectionConfig(section);
      if (!config?.clientScoped || (config.adminOnly && !auth.isAdmin)) continue;
      const rows = await selectRows<any>(config.table, {
        select: "*",
        client_id: eq(clientId),
        limit: 30,
        order: "created_at.desc",
      }).catch(() => []);
      for (const row of rows) {
        if (!auth.isAdmin && row.visibility === "internal") continue;
        const haystack = config.searchableFields.map((field) => String(row[field] || "")).join(" ").toLowerCase();
        if (haystack.includes(q)) {
          results.push({ section, label: config.label, id: row.id, title: row[config.titleField], row });
        }
      }
    }
    return jsonResponse({ results: results.slice(0, 100) });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Search failed." }, 500);
  }
};
