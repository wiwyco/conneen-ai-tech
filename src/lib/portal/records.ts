import type { PortalAuth } from "./auth";
import { canAccessClient } from "./auth";
import { cleanText } from "./http";
import { getSectionConfig } from "./tables";

const ALLOWED_GENERIC_FIELDS = new Set([
  "client_id",
  "project_id",
  "folder_id",
  "document_id",
  "workflow_id",
  "task_id",
  "user_story_id",
  "meeting_id",
  "metric_id",
  "milestone_id",
  "goal_id",
  "data_request_id",
  "ticket_id",
  "title",
  "name",
  "question",
  "answer",
  "description",
  "content",
  "note",
  "notes",
  "status",
  "priority",
  "task_type",
  "expected_hours",
  "success_metrics",
  "risks",
  "form_schema",
  "form_response",
  "upload_items",
  "duration_minutes",
  "visibility",
  "category",
  "tags",
  "review_status",
  "sensitivity",
  "file_name",
  "file_type",
  "file_size",
  "storage_path",
  "storage_bucket",
  "email",
  "phone",
  "title",
  "responsibilities",
  "organization_side",
  "current_process",
  "pain_points",
  "tools",
  "inputs",
  "outputs",
  "people_involved",
  "frequency",
  "cost_of_pain",
  "automation_opportunity",
  "workflow_type",
  "agile_epic",
  "agile_stage",
  "scope",
  "goals",
  "deliverables",
  "health_status",
  "stage",
  "due_date",
  "start_date",
  "target_date",
  "completed_at",
  "assigned_to",
  "created_by",
  "decision",
  "rationale",
  "decided_by",
  "decided_at",
  "meeting_at",
  "attendees",
  "action",
  "owner",
  "checklist_type",
  "requested_items",
  "submitted_by",
  "system_name",
  "access_type",
  "owner_contact",
  "safe_instructions",
  "integration_status",
  "diagram_url",
  "requirement_type",
  "acceptance_criteria",
  "impact_notes",
  "approval_notes",
  "estimate_type",
  "hourly_rate",
  "hour_range_low",
  "hour_range_high",
  "assumptions",
  "approval_status",
  "amount",
  "invoice_number",
  "issued_at",
  "paid_at",
  "contract_type",
  "signed_at",
  "issue_type",
  "resolved_at",
  "material_type",
  "url",
  "memory_type",
  "confidence",
  "transcript",
  "summary",
  "target_value",
  "baseline_value",
  "current_value",
  "measurement_method",
  "measurement_date",
  "value",
  "time_saved_notes",
  "revenue_impact_notes",
  "quality_impact_notes",
  "estimate_notes",
  "severity",
  "mitigation",
  "communication_style",
  "meeting_preferences",
  "technical_comfort",
  "reporting_cadence",
  "budget_sensitivity",
  "body",
  "notification_type",
  "status_label",
  "due_at",
  "event_at",
  "event_type",
  "location",
  "meeting_provider",
  "meeting_provider_id",
  "meeting_url",
  "meeting_password",
  "meeting_join_instructions",
  "scout_meeting_status",
  "scout_live_transcript",
  "scout_meeting_notes",
  "scout_key_takeaways",
  "scout_draft_deliverables",
  "scout_live_responses",
  "scout_is_addressed",
  "scout_response_delivery",
  "scout_latest_response",
  "scout_latest_response_at",
  "scout_stop_requested_at",
  "scout_last_summary_at",
]);

export function validateSectionAccess(auth: PortalAuth, section: string) {
  const config = getSectionConfig(section);
  if (!config) throw new Error("Unknown portal section.");
  if (config.adminOnly && !auth.isAdmin) throw new Error("Admin access required.");
  return config;
}

export function sanitizeRecordPayload(
  auth: PortalAuth,
  section: string,
  body: Record<string, unknown>,
  forcedClientId?: string
) {
  const config = validateSectionAccess(auth, section);
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body || {})) {
    if (!ALLOWED_GENERIC_FIELDS.has(key)) continue;
    if (key === "tags" && Array.isArray(value)) {
      payload[key] = value.map((tag) => cleanText(tag, 80)).filter(Boolean);
      continue;
    }
    if (key === "transcript") {
      payload[key] = Array.isArray(value) || typeof value === "object" ? value : [];
      continue;
    }
    payload[key] = typeof value === "string" ? cleanText(value, 8000) : value;
  }

  const clientId = forcedClientId || cleanText(body.client_id, 80) || auth.clientId;
  if (config.clientScoped) {
    if (!clientId) throw new Error("A client workspace is required.");
    if (!canAccessClient(auth, clientId)) throw new Error("You cannot access this client workspace.");
    payload.client_id = clientId;
  }

  if ("visibility" in payload && payload.visibility !== "shared" && payload.visibility !== "internal") {
    payload.visibility = "shared";
  }
  if (config.supportsVisibility === false) {
    delete payload.visibility;
  }

  return { config, payload, clientId: String(payload.client_id || clientId || "") };
}
