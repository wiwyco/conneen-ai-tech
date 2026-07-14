import type { APIRoute } from "astro";
import { canAccessClient, requirePortalAuth } from "../../../lib/portal/auth";
import { cleanText, jsonResponse } from "../../../lib/portal/http";
import { canPortalAction, filterReadableRecords, loadPortalAccessContext } from "../../../lib/portal/permissions";
import { ADMIN_PORTAL_SECTIONS, getSectionConfig } from "../../../lib/portal/tables";
import { eq, selectRows } from "../../../lib/portal/supabase";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const auth = await requirePortalAuth(request);
    const clientId = cleanText(url.searchParams.get("clientId"), 80) || auth.clientId || "";
    if (!clientId || !canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);
    const access = await loadPortalAccessContext(auth, clientId);

    const exportData: Record<string, unknown> = {};
    for (const section of ADMIN_PORTAL_SECTIONS) {
      const config = getSectionConfig(section);
      if (!config?.clientScoped || (config.adminOnly && !auth.isAdmin)) continue;
      if (!await canPortalAction(auth, { section, action: "read", clientId }, access)) continue;
      const rows = await selectRows<any>(config.table, {
        select: "*",
        client_id: eq(clientId),
        order: "created_at.desc",
      }).catch(() => []);
      exportData[section] = await filterReadableRecords(auth, section, clientId, rows, access);
    }

    return jsonResponse({
      generatedAt: new Date().toISOString(),
      clientId,
      export: exportData,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Export failed." }, 500);
  }
};
