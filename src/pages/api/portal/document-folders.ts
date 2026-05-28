import type { APIRoute } from "astro";
import { canAccessClient, requirePortalAuth } from "../../../lib/portal/auth";
import { logAudit, logTimeline } from "../../../lib/portal/activity";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { eq, insertRow, order, selectRows } from "../../../lib/portal/supabase";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const auth = await requirePortalAuth(request);
    const clientId = cleanText(url.searchParams.get("clientId"), 80) || auth.clientId || "";
    if (!clientId || !canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);

    const query: Record<string, string | number> = {
      client_id: eq(clientId),
      order: order("name", true),
      limit: 500,
    };
    if (!auth.isAdmin) query.or = "(visibility.eq.shared,visibility.is.null)";

    return jsonResponse({ folders: await selectRows("portal_document_folders", query) });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not load folders." }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const clientId = cleanText(body.clientId, 80) || auth.clientId || "";
    const name = cleanText(body.name, 160);
    const parentFolderId = cleanText(body.parentFolderId, 80);
    const visibility = cleanText(body.visibility, 20) === "internal" && auth.isAdmin ? "internal" : "shared";

    if (!clientId || !canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);
    if (!name) return jsonResponse({ error: "Folder name is required." }, 400);

    const folder = await insertRow<any>("portal_document_folders", {
      client_id: clientId,
      parent_folder_id: parentFolderId || null,
      name,
      visibility,
      created_by: auth.user.id,
    });

    await logAudit(auth, "create", "portal_document_folders", folder.id, clientId);
    await logTimeline(clientId, `Folder created: ${name}`, {
      auth,
      eventType: "folder_created",
      sourceTable: "portal_document_folders",
      sourceId: folder.id,
      visibility,
    });

    return jsonResponse({ folder });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not create folder." }, 500);
  }
};
