import type { APIRoute } from "astro";
import { canAccessClient, requirePortalAuth } from "../../../lib/portal/auth";
import { logAudit, logTimeline } from "../../../lib/portal/activity";
import { cleanText, jsonResponse } from "../../../lib/portal/http";
import { canPortalAction } from "../../../lib/portal/permissions";
import { insertRow } from "../../../lib/portal/supabase";
import { createSignedUrl, uploadStorageObject } from "../../../lib/portal/storage";
import { validatePortalUpload } from "../../../lib/portal/upload-policy";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    const form = await request.formData();
    const file = form.get("file");
    const clientId = cleanText(form.get("clientId"), 80) || auth.clientId || "";
    if (!clientId || !canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);
    if (!(file instanceof File)) return jsonResponse({ error: "A file is required." }, 400);
    const validation = validatePortalUpload(file);
    if (!validation.ok) return jsonResponse({ error: validation.error }, validation.status);
    if (!await canPortalAction(auth, { section: "documents", action: "upload_document", clientId, visibility: "shared" })) {
      return jsonResponse({ error: "Forbidden." }, 403);
    }

    const category = cleanText(form.get("category"), 120) || "general";
    const folderId = cleanText(form.get("folderId"), 80);
    const title = cleanText(form.get("title"), 240) || file.name;
    const visibility = cleanText(form.get("visibility"), 20) === "internal" && auth.isAdmin ? "internal" : "shared";
    const bucket = "client-documents";
    const objectPath = `${clientId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;

    await uploadStorageObject(bucket, objectPath, file);
    const documentPayload: Record<string, unknown> = {
      client_id: clientId,
      title,
      category,
      storage_bucket: bucket,
      storage_path: objectPath,
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
      visibility,
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
    await logAudit(auth, "upload", "portal_documents", document.id, clientId);
    await logTimeline(clientId, `Document uploaded: ${title}`, { auth, eventType: "document_uploaded", sourceTable: "portal_documents", sourceId: document.id, visibility });

    return jsonResponse({ document, signedUrl: await createSignedUrl(bucket, objectPath) });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Upload failed." }, 500);
  }
};
