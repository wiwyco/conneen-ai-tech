export type PortalSection =
  | "contacts"
  | "documents"
  | "document_notes"
  | "business_knowledge"
  | "workflows"
  | "pain_points"
  | "opportunities"
  | "projects"
  | "milestones"
  | "tasks"
  | "timeline_events"
  | "task_comments"
  | "decisions"
  | "meetings"
  | "meeting_action_items"
  | "checklist_items"
  | "data_requests"
  | "data_submissions"
  | "system_access"
  | "architecture_notes"
  | "requirements"
  | "change_requests"
  | "estimates"
  | "payments"
  | "invoices"
  | "contracts"
  | "support_tickets"
  | "support_comments"
  | "training_materials"
  | "handover_items"
  | "faqs"
  | "ai_memories"
  | "scout_transcripts"
  | "business_goals"
  | "success_metrics"
  | "measurements"
  | "roi_notes"
  | "risks"
  | "open_questions"
  | "preferences"
  | "notifications"
  | "tour_steps"
  | "admin_notes"
  | "followup_reminders"
  | "calendar_events";

export type PortalSectionConfig = {
  section: PortalSection;
  table: string;
  label: string;
  titleField: string;
  searchableFields: string[];
  sensitivity?: "public_client" | "client_shared" | "commercial_sensitive" | "internal_admin" | "security_sensitive";
  adminOnly?: boolean;
  clientScoped?: boolean;
  supportsVisibility?: boolean;
};

export const PORTAL_SECTION_SENSITIVITY: Record<string, NonNullable<PortalSectionConfig["sensitivity"]>> = {
  estimates: "commercial_sensitive",
  payments: "commercial_sensitive",
  invoices: "commercial_sensitive",
  contracts: "commercial_sensitive",
  roi_notes: "commercial_sensitive",
  admin_notes: "internal_admin",
  followup_reminders: "internal_admin",
  scout_transcripts: "internal_admin",
  audit_logs: "security_sensitive",
  access_audit_logs: "security_sensitive",
  email_events: "security_sensitive",
  sessions: "security_sensitive",
  invites: "security_sensitive",
  password_resets: "security_sensitive",
  magic_links: "security_sensitive",
  permission_groups: "security_sensitive",
  permission_group_members: "security_sensitive",
  access_policies: "security_sensitive",
  record_access: "security_sensitive",
};

export const PORTAL_SECTIONS: Record<PortalSection, PortalSectionConfig> = {
  contacts: { section: "contacts", table: "portal_contacts", label: "Contacts", titleField: "name", searchableFields: ["name", "email", "responsibilities"], clientScoped: true },
  documents: { section: "documents", table: "portal_documents", label: "Documents", titleField: "title", searchableFields: ["title", "description", "category"], clientScoped: true },
  document_notes: { section: "document_notes", table: "portal_document_notes", label: "Document Notes", titleField: "note", searchableFields: ["note"], clientScoped: true },
  business_knowledge: { section: "business_knowledge", table: "portal_business_knowledge", label: "Business Knowledge", titleField: "title", searchableFields: ["title", "content", "category"], clientScoped: true },
  workflows: { section: "workflows", table: "portal_workflows", label: "Workflows", titleField: "name", searchableFields: ["name", "current_process", "pain_points", "automation_opportunity"], clientScoped: true },
  pain_points: { section: "pain_points", table: "portal_pain_points", label: "Pain Points", titleField: "title", searchableFields: ["title", "description", "business_impact"], clientScoped: true, supportsVisibility: false },
  opportunities: { section: "opportunities", table: "portal_opportunities", label: "Opportunities", titleField: "title", searchableFields: ["title", "description", "recommended_next_step"], clientScoped: true, supportsVisibility: false },
  projects: { section: "projects", table: "portal_projects", label: "Projects", titleField: "name", searchableFields: ["name", "scope", "goals", "deliverables"], clientScoped: true },
  milestones: { section: "milestones", table: "portal_milestones", label: "Milestones", titleField: "name", searchableFields: ["name", "notes"], clientScoped: true, supportsVisibility: false },
  tasks: { section: "tasks", table: "portal_tasks", label: "Tasks", titleField: "title", searchableFields: ["title", "description"], clientScoped: true },
  timeline_events: { section: "timeline_events", table: "portal_timeline_events", label: "Timeline Events", titleField: "title", searchableFields: ["title", "description", "event_type"], clientScoped: true },
  task_comments: { section: "task_comments", table: "portal_task_comments", label: "Task Comments", titleField: "comment", searchableFields: ["comment"], clientScoped: true },
  decisions: { section: "decisions", table: "portal_decisions", label: "Decision Log", titleField: "title", searchableFields: ["title", "decision", "rationale"], clientScoped: true },
  meetings: { section: "meetings", table: "portal_meetings", label: "Meeting Notes", titleField: "title", searchableFields: ["title", "notes", "attendees"], clientScoped: true },
  meeting_action_items: { section: "meeting_action_items", table: "portal_meeting_action_items", label: "Meeting Actions", titleField: "action", searchableFields: ["action", "owner"], clientScoped: true, supportsVisibility: false },
  checklist_items: { section: "checklist_items", table: "portal_checklist_items", label: "Checklists", titleField: "title", searchableFields: ["title", "description"], clientScoped: true, supportsVisibility: false },
  data_requests: { section: "data_requests", table: "portal_data_requests", label: "Data Requests", titleField: "title", searchableFields: ["title", "requested_items"], clientScoped: true, supportsVisibility: false },
  data_submissions: { section: "data_submissions", table: "portal_data_submissions", label: "Data Submissions", titleField: "title", searchableFields: ["title", "notes"], clientScoped: true, supportsVisibility: false },
  system_access: { section: "system_access", table: "portal_system_access", label: "System Access", titleField: "system_name", searchableFields: ["system_name", "safe_instructions", "notes"], clientScoped: true, supportsVisibility: false },
  architecture_notes: { section: "architecture_notes", table: "portal_architecture_notes", label: "Architecture Notes", titleField: "title", searchableFields: ["title", "content"], clientScoped: true },
  requirements: { section: "requirements", table: "portal_requirements", label: "Requirements", titleField: "title", searchableFields: ["title", "description", "acceptance_criteria"], clientScoped: true },
  change_requests: { section: "change_requests", table: "portal_change_requests", label: "Change Requests", titleField: "title", searchableFields: ["title", "description", "impact_notes"], clientScoped: true, supportsVisibility: false },
  estimates: { section: "estimates", table: "portal_estimates", label: "Estimates", titleField: "title", searchableFields: ["title", "assumptions"], clientScoped: true, sensitivity: "commercial_sensitive" },
  payments: { section: "payments", table: "portal_payments", label: "Milestone Payments", titleField: "title", searchableFields: ["title", "notes"], clientScoped: true, sensitivity: "commercial_sensitive" },
  invoices: { section: "invoices", table: "portal_invoices", label: "Invoices", titleField: "invoice_number", searchableFields: ["invoice_number", "notes"], clientScoped: true, sensitivity: "commercial_sensitive" },
  contracts: { section: "contracts", table: "portal_contracts", label: "Contracts & SOWs", titleField: "title", searchableFields: ["title", "notes"], clientScoped: true, sensitivity: "commercial_sensitive" },
  support_tickets: { section: "support_tickets", table: "portal_support_tickets", label: "Support Tickets", titleField: "title", searchableFields: ["title", "description", "issue_type"], clientScoped: true },
  support_comments: { section: "support_comments", table: "portal_support_comments", label: "Support Comments", titleField: "comment", searchableFields: ["comment"], clientScoped: true },
  training_materials: { section: "training_materials", table: "portal_training_materials", label: "Training Materials", titleField: "title", searchableFields: ["title", "description"], clientScoped: true },
  handover_items: { section: "handover_items", table: "portal_handover_items", label: "Handover Package", titleField: "title", searchableFields: ["title", "description"], clientScoped: true },
  faqs: { section: "faqs", table: "portal_faqs", label: "Client FAQ", titleField: "question", searchableFields: ["question", "answer"], clientScoped: true },
  ai_memories: { section: "ai_memories", table: "portal_ai_memories", label: "AI Memory", titleField: "title", searchableFields: ["title", "content"], clientScoped: true },
  scout_transcripts: { section: "scout_transcripts", table: "portal_scout_transcripts", label: "Scout Transcripts", titleField: "title", searchableFields: ["title", "summary"], adminOnly: true, clientScoped: true, supportsVisibility: false, sensitivity: "internal_admin" },
  business_goals: { section: "business_goals", table: "portal_business_goals", label: "Business Goals", titleField: "title", searchableFields: ["title", "description"], clientScoped: true, supportsVisibility: false },
  success_metrics: { section: "success_metrics", table: "portal_success_metrics", label: "Success Metrics", titleField: "name", searchableFields: ["name", "measurement_method"], clientScoped: true, supportsVisibility: false },
  measurements: { section: "measurements", table: "portal_measurements", label: "Measurements", titleField: "value", searchableFields: ["value", "notes"], clientScoped: true, supportsVisibility: false },
  roi_notes: { section: "roi_notes", table: "portal_roi_notes", label: "ROI Notes", titleField: "title", searchableFields: ["title", "time_saved_notes", "revenue_impact_notes"], clientScoped: true, sensitivity: "commercial_sensitive" },
  risks: { section: "risks", table: "portal_risks", label: "Risk Register", titleField: "title", searchableFields: ["title", "description", "mitigation"], clientScoped: true, supportsVisibility: false },
  open_questions: { section: "open_questions", table: "portal_open_questions", label: "Open Questions", titleField: "question", searchableFields: ["question", "answer"], clientScoped: true },
  preferences: { section: "preferences", table: "portal_preferences", label: "Client Preferences", titleField: "communication_style", searchableFields: ["communication_style", "meeting_preferences", "notes"], clientScoped: true, supportsVisibility: false },
  notifications: { section: "notifications", table: "portal_notifications", label: "Notifications", titleField: "title", searchableFields: ["title", "body"], clientScoped: true, supportsVisibility: false },
  tour_steps: { section: "tour_steps", table: "portal_tour_steps", label: "Setup Tour", titleField: "title", searchableFields: ["title", "body", "portal_section"], clientScoped: true },
  admin_notes: { section: "admin_notes", table: "portal_admin_notes", label: "Admin Notes", titleField: "title", searchableFields: ["title", "note", "status_label"], adminOnly: true, clientScoped: true, supportsVisibility: false, sensitivity: "internal_admin" },
  followup_reminders: { section: "followup_reminders", table: "portal_followup_reminders", label: "Follow-up Reminders", titleField: "title", searchableFields: ["title", "notes"], adminOnly: true, clientScoped: true, supportsVisibility: false, sensitivity: "internal_admin" },
  calendar_events: { section: "calendar_events", table: "portal_calendar_events", label: "Calendar Events", titleField: "title", searchableFields: ["title", "notes"], clientScoped: true },
};

export const CLIENT_PORTAL_SECTIONS: PortalSection[] = [
  "documents",
  "business_knowledge",
  "workflows",
  "projects",
  "tasks",
  "decisions",
  "meetings",
  "checklist_items",
  "data_requests",
  "system_access",
  "support_tickets",
  "training_materials",
  "handover_items",
  "faqs",
  "business_goals",
  "success_metrics",
  "notifications",
];

export const ADMIN_PORTAL_SECTIONS = Object.keys(PORTAL_SECTIONS) as PortalSection[];

export function getSectionConfig(section: string): PortalSectionConfig | null {
  return (PORTAL_SECTIONS as Record<string, PortalSectionConfig>)[section] || null;
}
