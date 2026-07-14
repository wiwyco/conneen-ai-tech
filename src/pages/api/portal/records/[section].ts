import type { APIRoute } from "astro";
import { canAccessClient, requirePortalAuth } from "../../../../lib/portal/auth";
import { logAudit, logTimeline } from "../../../../lib/portal/activity";
import { cleanText, jsonResponse, readJson } from "../../../../lib/portal/http";
import { canPortalAction, filterReadableRecords, loadPortalAccessContext } from "../../../../lib/portal/permissions";
import { sanitizeRecordPayload, validateSectionAccess } from "../../../../lib/portal/records";
import { eq, insertRow, order, selectOne, selectRows, updateRows } from "../../../../lib/portal/supabase";

export const prerender = false;

export const GET: APIRoute = async ({ request, params, url }) => {
  try {
    const auth = await requirePortalAuth(request);
    const config = validateSectionAccess(auth, params.section || "");
    const clientId = cleanText(url.searchParams.get("clientId"), 80) || auth.clientId || "";

    const query: Record<string, string | number> = {
      select: "*",
      order: order("created_at"),
      limit: Number(url.searchParams.get("limit") || 200),
    };

    if (config.clientScoped) {
      if (!clientId) return jsonResponse({ error: "Client id is required." }, 400);
      if (!canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);
      if (!await canPortalAction(auth, { section: config.section, action: "read", clientId })) {
        return jsonResponse({ error: "Forbidden." }, 403);
      }
      query.client_id = eq(clientId);
    }

    const rows = await selectRows<any>(config.table, query);
    const visibleRows = config.clientScoped && clientId
      ? await filterReadableRecords(auth, config.section, clientId, rows, await loadPortalAccessContext(auth, clientId))
      : rows;
    return jsonResponse({ section: config.section, label: config.label, rows: visibleRows });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not load records." }, 500);
  }
};

export const POST: APIRoute = async ({ request, params }) => {
  try {
    const auth = await requirePortalAuth(request);
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const { config, payload, clientId } = sanitizeRecordPayload(auth, params.section || "", body);
    if (config.section === "tasks" && !auth.isAdmin) {
      return jsonResponse({ error: "Only admins can create tasks." }, 403);
    }
    if (!await canPortalAction(auth, { section: config.section, action: "create", clientId, projectId: cleanText(payload.project_id, 80), visibility: cleanText(payload.visibility, 20) })) {
      return jsonResponse({ error: "Forbidden." }, 403);
    }
    const row = await insertRow<any>(config.table, {
      ...payload,
    });

    await logAudit(auth, "create", config.table, row.id, clientId);
    if (clientId) {
      await logTimeline(clientId, `${config.label}: ${row[config.titleField] || "new item"}`, {
        auth,
        eventType: "record_created",
        sourceTable: config.table,
        sourceId: row.id,
        visibility: row.visibility === "internal" ? "internal" : "shared",
      });
    }

    return jsonResponse({ row });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not create record." }, 500);
  }
};

export const PATCH: APIRoute = async ({ request, params }) => {
  try {
    const auth = await requirePortalAuth(request);
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const id = cleanText(body.id, 80);
    if (!id) return jsonResponse({ error: "Record id is required." }, 400);

    const { config, payload, clientId } = sanitizeRecordPayload(auth, params.section || "", body);
    delete payload.client_id;
    if (config.section === "tasks" && !auth.isAdmin) {
      const allowedKeys = new Set(["status"]);
      const updateKeys = Object.keys(payload).filter((key) => key !== "updated_at");
      if (updateKeys.some((key) => !allowedKeys.has(key))) {
        return jsonResponse({ error: "Only admins can edit task details." }, 403);
      }
      const existing = await selectOne<any>(config.table, { id: eq(id), client_id: eq(clientId) });
      if (!existing || existing.assigned_to !== auth.user.id) {
        return jsonResponse({ error: "Only the assigned user can move this task." }, 403);
      }
      if (!await canPortalAction(auth, { section: config.section, action: "move_task", clientId, projectId: existing.project_id, recordId: id, record: existing })) {
        return jsonResponse({ error: "Forbidden." }, 403);
      }
    } else {
      const existing = config.clientScoped
        ? await selectOne<any>(config.table, { id: eq(id), client_id: eq(clientId) })
        : await selectOne<any>(config.table, { id: eq(id) });
      if (!existing) return jsonResponse({ error: "Record not found." }, 404);
      if (!await canPortalAction(auth, { section: config.section, action: "update", clientId, projectId: existing.project_id || cleanText(payload.project_id, 80), recordId: id, record: existing })) {
        return jsonResponse({ error: "Forbidden." }, 403);
      }
    }
    const query = config.clientScoped ? { id: eq(id), client_id: eq(clientId) } : { id: eq(id) };
    const [row] = await updateRows<any>(config.table, query, { ...payload, updated_at: new Date().toISOString() });
    await logAudit(auth, "update", config.table, id, clientId);
    return jsonResponse({ row });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not update record." }, 500);
  }
};
