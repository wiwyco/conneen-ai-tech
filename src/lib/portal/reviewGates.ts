import type { PortalAuth } from "./auth";
import { cleanText } from "./http";

const REVIEWABLE_AI_TABLES = new Set([
  "portal_documents",
  "portal_business_knowledge",
  "portal_workflows",
  "portal_projects",
  "portal_tasks",
  "portal_decisions",
  "portal_meetings",
  "portal_timeline_events",
  "portal_requirements",
  "portal_estimates",
  "portal_payments",
  "portal_invoices",
  "portal_contracts",
  "portal_support_tickets",
  "portal_training_materials",
  "portal_handover_items",
  "portal_faqs",
  "portal_open_questions",
  "portal_notifications",
  "portal_tour_steps",
  "portal_calendar_events",
  "portal_data_requests",
  "portal_system_access",
  "portal_business_goals",
  "portal_success_metrics",
  "portal_risks",
  "portal_milestones",
  "portal_change_requests",
]);

const FORCE_REVIEW_TABLES = new Set([
  "portal_estimates",
  "portal_invoices",
  "portal_contracts",
  "portal_decisions",
]);

const VISIBILITY_TABLES = new Set([
  "portal_documents",
  "portal_business_knowledge",
  "portal_workflows",
  "portal_projects",
  "portal_tasks",
  "portal_decisions",
  "portal_meetings",
  "portal_timeline_events",
  "portal_requirements",
  "portal_estimates",
  "portal_payments",
  "portal_invoices",
  "portal_contracts",
  "portal_support_tickets",
  "portal_training_materials",
  "portal_handover_items",
  "portal_faqs",
  "portal_open_questions",
  "portal_tour_steps",
  "portal_calendar_events",
]);

const APPROVED_REVIEW_STATUSES = new Set(["approved", "reviewed"]);

export function isReviewPending(record: Record<string, any> | null | undefined) {
  if (!record) return false;
  const status = cleanText(record.review_status, 40).toLowerCase();
  return record.review_required === true || ["pending_review", "needs_review", "rejected"].includes(status);
}

export function canShareReviewedRecord(record: Record<string, any> | null | undefined) {
  if (!record) return false;
  const status = cleanText(record.review_status, 40).toLowerCase();
  return !isReviewPending(record) || APPROVED_REVIEW_STATUSES.has(status);
}

export function applyAiReviewGate(
  table: string,
  payload: Record<string, unknown>,
  generatedBy: string,
  reason = "AI-generated record requires Conneen AI review before client visibility."
) {
  if (!REVIEWABLE_AI_TABLES.has(table)) return payload;

  const wantsClientVisibility = cleanText(payload.visibility, 20) !== "internal";
  const requiresReview = FORCE_REVIEW_TABLES.has(table) || wantsClientVisibility;
  if (!requiresReview) {
    return {
      ...payload,
      generated_by: generatedBy,
    };
  }

  return {
    ...payload,
    ...(VISIBILITY_TABLES.has(table) ? { visibility: "internal" } : {}),
    review_status: "pending_review",
    review_required: true,
    review_reason: reason,
    generated_by: generatedBy,
  };
}

export function applyManualReviewMetadata(
  auth: PortalAuth,
  payload: Record<string, unknown>,
  existing?: Record<string, any> | null
) {
  delete payload.reviewed_by;
  delete payload.reviewed_at;
  if (!auth.isAdmin) {
    delete payload.review_status;
    delete payload.review_required;
    delete payload.review_reason;
    delete payload.generated_by;
    delete payload.source_table;
    delete payload.source_record_id;
    delete payload.source_hash;
    delete payload.source_run_id;
    delete payload.source_item_key;
    return payload;
  }

  const status = cleanText(payload.review_status, 40).toLowerCase();
  if ("review_status" in payload && !status) delete payload.review_status;
  if ("review_reason" in payload && !cleanText(payload.review_reason, 8000)) delete payload.review_reason;
  if (APPROVED_REVIEW_STATUSES.has(status)) {
    payload.review_status = "approved";
    payload.review_required = false;
    payload.reviewed_by = auth.user.id;
    payload.reviewed_at = new Date().toISOString();
    return payload;
  }

  const next = { ...(existing || {}), ...payload };
  if (isReviewPending(next)) {
    payload.review_required = true;
    if (payload.visibility === "shared") payload.visibility = "internal";
  }
  return payload;
}
