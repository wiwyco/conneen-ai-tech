import type { APIRoute } from "astro";
import { logAudit, logTimeline } from "../../../lib/portal/activity";
import { canAccessClient, requirePortalAuth } from "../../../lib/portal/auth";
import { cleanText, jsonResponse } from "../../../lib/portal/http";
import { eq, insertRow, selectOne, updateRows } from "../../../lib/portal/supabase";
import { uploadStorageObject } from "../../../lib/portal/storage";

export const prerender = false;

function normalizeItemId(value: unknown, fallback: string) {
  return cleanText(value, 80).replace(/[^a-zA-Z0-9_-]/g, "_") || fallback;
}

function normalizeUploadItems(task: any) {
  return Array.isArray(task.upload_items)
    ? task.upload_items
        .filter((item: any) => item && typeof item === "object" && (item.title || item.name))
        .map((item: any, index: number) => ({
          ...item,
          id: normalizeItemId(item.id || item.key, `upload_${index + 1}`),
          title: cleanText(item.title || item.name, 240) || `Requested document ${index + 1}`,
          description: cleanText(item.description || item.instructions || item.requested_items, 2000),
          category: cleanText(item.category, 120) || "requested document",
        }))
    : [];
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    const form = await request.formData();
    const file = form.get("file");
    const clientId = cleanText(form.get("clientId"), 80) || auth.clientId || "";
    const taskId = cleanText(form.get("taskId"), 80);
    const itemId = normalizeItemId(form.get("itemId"), "");
    const folderId = cleanText(form.get("folderId"), 80);

    if (!clientId || !taskId || !itemId) return jsonResponse({ error: "Upload request is incomplete." }, 400);
    if (!canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);
    if (!(file instanceof File)) return jsonResponse({ error: "A file is required." }, 400);

    const task = await selectOne<any>("portal_tasks", { id: eq(taskId), client_id: eq(clientId) });
    if (!task) return jsonResponse({ error: "Task not found." }, 404);
    if (!auth.isAdmin && task.visibility === "internal") return jsonResponse({ error: "Forbidden." }, 403);

    const items = normalizeUploadItems(task);
    const target = items.find((item: any) => item.id === itemId);
    if (!target) return jsonResponse({ error: "Upload item not found." }, 404);
    if (target.uploaded_document_id) return jsonResponse({ error: "That document has already been uploaded." }, 409);

    const bucket = "client-documents";
    const objectPath = `${clientId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
    await uploadStorageObject(bucket, objectPath, file);

    const documentPayload: Record<string, unknown> = {
      client_id: clientId,
      project_id: task.project_id || null,
      title: target.title || file.name,
      category: target.category || "requested document",
      description: target.description || null,
      storage_bucket: bucket,
      storage_path: objectPath,
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
      visibility: "shared",
      uploaded_by: auth.user.id,
    };
    if (folderId) documentPayload.folder_id = folderId;

    const document = await insertRow<any>("portal_documents", documentPayload);
    await insertRow("portal_document_versions", {
      document_id: document.id,
      version_label: "v1",
      storage_path: objectPath,
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
      uploaded_by: auth.user.id,
    });

    const uploadedAt = new Date().toISOString();
    const updatedItems = items.map((item: any) =>
      item.id === itemId
        ? {
            ...item,
            uploaded_document_id: document.id,
            uploaded_file_name: file.name,
            uploaded_at: uploadedAt,
            uploaded_by_user_id: auth.user.id,
          }
        : item
    );
    const complete = updatedItems.every((item: any) => item.uploaded_document_id);
    const [updatedTask] = await updateRows<any>(
      "portal_tasks",
      { id: eq(taskId), client_id: eq(clientId) },
      {
        upload_items: updatedItems,
        status: complete ? "complete" : task.status || "todo",
        completed_at: complete ? uploadedAt : task.completed_at || null,
        updated_at: uploadedAt,
      }
    );

    await logAudit(auth, "upload_task_document", "portal_documents", document.id, clientId, { task_id: taskId, item_id: itemId });
    await logTimeline(clientId, `Document uploaded: ${target.title || file.name}`, {
      auth,
      projectId: task.project_id || null,
      eventType: "document_uploaded",
      sourceTable: "portal_documents",
      sourceId: document.id,
      visibility: "shared",
    });

    return jsonResponse({ document, task: updatedTask });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Upload failed." }, 500);
  }
};
