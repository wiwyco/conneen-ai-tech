import type { PortalAuth } from "./auth";
import { insertRow } from "./supabase";

export async function logAudit(
  auth: PortalAuth | null,
  action: string,
  tableName?: string,
  recordId?: string,
  clientId?: string | null,
  metadata: Record<string, unknown> = {}
) {
  await insertRow("portal_audit_logs", {
    client_id: clientId || auth?.clientId || null,
    actor_user_id: auth?.user.id || null,
    action,
    table_name: tableName || null,
    record_id: recordId || null,
    metadata,
  }).catch((error) => console.warn("Audit log skipped:", error));
}

export async function logTimeline(
  clientId: string,
  title: string,
  options: {
    auth?: PortalAuth | null;
    projectId?: string | null;
    eventType?: string;
    description?: string;
    sourceTable?: string;
    sourceId?: string;
    visibility?: "shared" | "internal";
  } = {}
) {
  await insertRow("portal_timeline_events", {
    client_id: clientId,
    project_id: options.projectId || null,
    event_type: options.eventType || "update",
    title,
    description: options.description || null,
    actor_user_id: options.auth?.user.id || null,
    source_table: options.sourceTable || null,
    source_id: options.sourceId || null,
    visibility: options.visibility || "shared",
  }).catch((error) => console.warn("Timeline event skipped:", error));
}

export async function createNotification(
  clientId: string,
  title: string,
  body: string,
  userId?: string | null,
  sourceTable?: string,
  sourceId?: string
) {
  await insertRow("portal_notifications", {
    client_id: clientId,
    user_id: userId || null,
    title,
    body,
    source_table: sourceTable || null,
    source_id: sourceId || null,
  }).catch((error) => console.warn("Notification skipped:", error));
}
