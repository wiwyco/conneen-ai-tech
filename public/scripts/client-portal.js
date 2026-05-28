const app = document.querySelector("[data-portal-app]");
const portalMode = app?.dataset.portalMode || "login";

const state = {
  user: null,
  isAdmin: false,
  clientId: "",
  clients: [],
  dashboard: null,
  documentFolders: [],
  documentRows: [],
  documentUploadTasks: [],
  documentFolderId: "",
  documentClientId: "",
  projectRecords: {
    projects: [],
    milestones: [],
    estimates: [],
    payments: [],
    invoices: [],
    contracts: [],
  },
  selectedProjectId: "",
  projectClientId: "",
  projectScoutMessages: [],
  knowledgeRecords: [],
  knowledgeClientId: "",
  workRecords: {
    projects: [],
    tasks: [],
    requirements: [],
    users: [],
  },
  workClientId: "",
  workProjectId: "",
  supportRecords: {
    events: [],
    busySlots: [],
    tasks: [],
    projects: [],
    milestones: [],
  },
  currentMeetingScoutId: "",
  setupTourDismissedClientId: "",
};

const knowledgeSections = [
  "business_knowledge",
  "workflows",
  "pain_points",
  "opportunities",
  "requirements",
  "decisions",
  "meetings",
  "business_goals",
  "architecture_notes",
  "faqs",
  "ai_memories",
];

const workStatuses = [
  { value: "todo", label: "To-do" },
  { value: "in_work", label: "In work" },
  { value: "in_testing", label: "In testing" },
  { value: "out_for_review", label: "Out for review" },
  { value: "complete", label: "Complete" },
];

const taskTypeLabels = {
  development: "Development",
  open_question: "Open question",
  data_request: "Data request",
  data_submission: "Data submission",
  system_access: "System access",
  onboarding: "Onboarding task",
  customer_questions: "Customer questions",
  meeting_action: "Meeting action item",
  support_ticket: "Support ticket",
  training_material: "Training material development",
  handover_package: "Handover package development",
};

const supportTaskTypeOptions = [
  ["development", "Development"],
  ["open_question", "Open question"],
  ["data_request", "Data request"],
  ["data_submission", "Data submission"],
  ["system_access", "System access"],
  ["onboarding", "Onboarding task"],
  ["customer_questions", "Customer questions"],
  ["meeting_action", "Meeting action item"],
  ["support_ticket", "Support ticket"],
  ["training_material", "Training material development"],
  ["handover_package", "Handover package development"],
];

const pageSubtitles = {
  dashboard: "Your current project health, next actions, and recent workspace movement.",
  documents: "Shared files, folders, and deliverables for this client workspace.",
  projects: "Select a project to review milestones, estimates, payments, invoices, and SOWs.",
  knowledge: "Scout and admin-curated context that shapes the work behind the scenes.",
  work: "A project board for tasks and user stories, organized by current status.",
  support: "Schedule meetings and review the delivery timeline for upcoming work.",
  ai: "Ask Scout for summaries, next actions, scope drafts, and project context.",
  admin: "Internal controls for clients, users, reminders, and Scout archives.",
};

let toastTimer = null;
let setupTourCompletionTimer = null;
let walkthroughState = null;

const sectionConfig = {
  documents: { label: "Documents", title: "title", fields: [["title", "Title"], ["category", "Category"], ["description", "Description", "textarea"], ["tags", "Tags, comma separated"], ["visibility", "Visibility", "visibility"]] },
  projects: { label: "Projects", title: "name", fields: [["name", "Name"], ["agile_stage", "Agile stage"], ["status", "Status"], ["scope", "Scope", "textarea"], ["goals", "Goals", "textarea"], ["deliverables", "Deliverables", "textarea"], ["target_date", "Target date", "date"], ["visibility", "Visibility", "visibility"]] },
  milestones: { label: "Milestones", title: "name", fields: [["name", "Name"], ["stage", "Stage"], ["status", "Status"], ["due_date", "Due date", "date"], ["notes", "Notes", "textarea"]] },
  estimates: { label: "Quote / Estimate History", title: "title", fields: [["title", "Title"], ["estimate_type", "Type"], ["hour_range_low", "Low hours", "number"], ["hour_range_high", "High hours", "number"], ["assumptions", "Assumptions", "textarea"], ["approval_status", "Approval status"]] },
  payments: { label: "Milestone Payments", title: "title", fields: [["title", "Title"], ["amount", "Amount", "number"], ["status", "Status"], ["due_date", "Due date", "date"], ["notes", "Notes", "textarea"], ["visibility", "Visibility", "visibility"]] },
  invoices: { label: "Invoices", title: "invoice_number", fields: [["invoice_number", "Invoice number"], ["amount", "Amount", "number"], ["status", "Status"], ["issued_at", "Issued", "date"], ["due_date", "Due", "date"], ["notes", "Notes", "textarea"]] },
  contracts: { label: "Contracts / SOWs", title: "title", fields: [["title", "Title"], ["contract_type", "Type"], ["status", "Status"], ["signed_at", "Signed date", "date"], ["notes", "Notes", "textarea"]] },
  business_knowledge: { label: "Business Knowledge", title: "title", fields: [["title", "Title"], ["category", "Category"], ["content", "Content", "textarea"], ["tags", "Tags, comma separated"], ["visibility", "Visibility", "visibility"]] },
  workflows: { label: "Workflow Inventory", title: "name", fields: [["name", "Name"], ["agile_epic", "Agile epic"], ["current_process", "Current process", "textarea"], ["pain_points", "Pain points", "textarea"], ["tools", "Tools"], ["inputs", "Inputs"], ["outputs", "Outputs"], ["people_involved", "People"], ["frequency", "Frequency"], ["cost_of_pain", "Cost of pain"], ["automation_opportunity", "Automation opportunity", "textarea"], ["priority", "Priority"], ["status", "Status"], ["visibility", "Visibility", "visibility"]] },
  pain_points: { label: "Pain Points", title: "title", fields: [["title", "Title"], ["description", "Description", "textarea"], ["severity", "Severity"], ["business_impact", "Business impact", "textarea"], ["status", "Status"]] },
  opportunities: { label: "Opportunity Backlog", title: "title", fields: [["title", "Title"], ["description", "Description", "textarea"], ["value_score", "Value score", "number"], ["difficulty_score", "Difficulty score", "number"], ["urgency_score", "Urgency score", "number"], ["readiness_score", "Readiness score", "number"], ["recommended_next_step", "Recommended next step", "textarea"], ["status", "Status"]] },
  requirements: { label: "Requirements", title: "title", fields: [["title", "Title"], ["requirement_type", "Type"], ["priority", "Priority"], ["status", "Status"], ["description", "Description", "textarea"], ["acceptance_criteria", "Acceptance criteria", "textarea"], ["visibility", "Visibility", "visibility"]] },
  architecture_notes: { label: "Architecture Notes", title: "title", fields: [["title", "Title"], ["content", "Content", "textarea"], ["diagram_url", "Diagram URL"], ["visibility", "Visibility", "visibility"]] },
  faqs: { label: "Client FAQ", title: "question", fields: [["question", "Question", "textarea"], ["answer", "Answer", "textarea"], ["tags", "Tags, comma separated"], ["visibility", "Visibility", "visibility"]] },
  ai_memories: { label: "Client AI Memory", title: "title", fields: [["title", "Title"], ["memory_type", "Type"], ["content", "Content", "textarea"], ["confidence", "Confidence"], ["visibility", "Visibility", "visibility"]] },
  tasks: { label: "Task Board", title: "title", fields: [["title", "Title"], ["task_type", "Type"], ["description", "Description", "textarea"], ["status", "Status"], ["priority", "Priority"], ["expected_hours", "Expected hours", "number"], ["success_metrics", "Success metrics", "textarea"], ["risks", "Risks", "textarea"], ["due_date", "Due date", "date"], ["visibility", "Visibility", "visibility"]] },
  decisions: { label: "Decision Log", title: "title", fields: [["title", "Title"], ["decision", "Decision", "textarea"], ["rationale", "Rationale", "textarea"], ["decided_by", "Decided by"], ["decided_at", "Date", "date"], ["visibility", "Visibility", "visibility"]] },
  meetings: { label: "Meeting Notes", title: "title", fields: [["title", "Title"], ["meeting_at", "Meeting date/time"], ["attendees", "Attendees"], ["notes", "Notes", "textarea"], ["visibility", "Visibility", "visibility"]] },
  meeting_action_items: { label: "Meeting Action Items", title: "action", fields: [["action", "Action", "textarea"], ["owner", "Owner"], ["due_date", "Due date", "date"], ["status", "Status"]] },
  checklist_items: { label: "Onboarding / Checklists", title: "title", fields: [["title", "Title"], ["checklist_type", "Type"], ["description", "Description", "textarea"], ["status", "Status"], ["due_date", "Due date", "date"]] },
  data_requests: { label: "Data Requests", title: "title", fields: [["title", "Title"], ["requested_items", "Requested items", "textarea"], ["status", "Status"], ["due_date", "Due date", "date"]] },
  data_submissions: { label: "Data Submissions", title: "title", fields: [["title", "Title"], ["notes", "Notes", "textarea"], ["status", "Status"]] },
  system_access: { label: "System Access", title: "system_name", fields: [["system_name", "System name"], ["access_type", "Access type"], ["status", "Status"], ["owner_contact", "Owner/contact"], ["safe_instructions", "Safe instructions", "textarea"], ["integration_status", "Integration status"], ["notes", "Notes", "textarea"]] },
  business_goals: { label: "Business Goals", title: "title", fields: [["title", "Title"], ["description", "Description", "textarea"], ["status", "Status"], ["target_date", "Target date", "date"]] },
  success_metrics: { label: "Success Metrics", title: "name", fields: [["name", "Name"], ["baseline_value", "Baseline"], ["target_value", "Target"], ["current_value", "Current"], ["measurement_method", "Measurement method", "textarea"], ["status", "Status"]] },
  risks: { label: "Risk Register", title: "title", fields: [["title", "Title"], ["description", "Description", "textarea"], ["severity", "Severity"], ["mitigation", "Mitigation", "textarea"], ["status", "Status"]] },
  open_questions: { label: "Open Questions", title: "question", fields: [["question", "Question", "textarea"], ["owner", "Owner"], ["answer", "Answer", "textarea"], ["status", "Status"], ["visibility", "Visibility", "visibility"]] },
  support_tickets: { label: "Support Tickets", title: "title", fields: [["title", "Title"], ["description", "Description", "textarea"], ["status", "Status"], ["priority", "Priority"], ["issue_type", "Issue type"], ["visibility", "Visibility", "visibility"]] },
  training_materials: { label: "Training Materials", title: "title", fields: [["title", "Title"], ["material_type", "Type"], ["description", "Description", "textarea"], ["url", "URL"], ["visibility", "Visibility", "visibility"]] },
  handover_items: { label: "Handover Package", title: "title", fields: [["title", "Title"], ["description", "Description", "textarea"], ["status", "Status"], ["visibility", "Visibility", "visibility"]] },
  calendar_events: { label: "Calendar / Events", title: "title", fields: [["title", "Title"], ["event_type", "Type"], ["event_at", "Date/time"], ["duration_minutes", "Duration minutes", "number"], ["location", "Location"], ["meeting_provider", "Meeting provider"], ["meeting_url", "Meeting URL"], ["scout_meeting_notes", "Scout notes", "textarea"], ["scout_key_takeaways", "Key takeaways", "textarea"], ["scout_draft_deliverables", "Draft deliverables", "textarea"], ["notes", "Notes", "textarea"], ["visibility", "Visibility", "visibility"]] },
  notifications: { label: "Notifications", title: "title", fields: [["title", "Title"], ["body", "Body", "textarea"], ["notification_type", "Type"]] },
  tour_steps: { label: "Setup Tour", title: "title", fields: [["title", "Title"], ["body", "Body", "textarea"], ["portal_section", "Portal section"], ["sort_order", "Sort order", "number"], ["visibility", "Visibility", "visibility"]] },
  admin_notes: { label: "Admin Notes", title: "title", fields: [["title", "Title"], ["note", "Note", "textarea"], ["status_label", "Status label"]] },
  followup_reminders: { label: "Follow-up Reminders", title: "title", fields: [["title", "Title"], ["due_at", "Due"], ["status", "Status"], ["notes", "Notes", "textarea"]] },
  scout_transcripts: { label: "Scout Transcript Archive", title: "title", fields: [["title", "Title"], ["summary", "Summary", "textarea"]] },
  roi_notes: { label: "ROI Notes", title: "title", fields: [["title", "Title"], ["time_saved_notes", "Time saved", "textarea"], ["revenue_impact_notes", "Revenue impact", "textarea"], ["quality_impact_notes", "Quality impact", "textarea"], ["estimate_notes", "Estimate notes", "textarea"]] },
  change_requests: { label: "Change Requests", title: "title", fields: [["title", "Title"], ["description", "Description", "textarea"], ["status", "Status"], ["impact_notes", "Impact notes", "textarea"], ["approval_notes", "Approval notes", "textarea"]] },
};

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function setStatus(message, isError = false) {
  const el = qs("[data-portal-status]");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("error", isError);
  el.classList.toggle("loading", Boolean(message) && !isError);
}

function showToast(message, type = "success") {
  const region = qs("[data-toast-region]");
  if (!region || !message) return;
  region.innerHTML = `<div class="toast ${type}">${escapeHtml(message)}</div>`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    region.innerHTML = "";
  }, 3200);
}

const walkthroughs = {
  dashboard: [
    {
      selector: "[data-executive-summary]",
      title: "Your quick read",
      body: "Here is Scout's first pass at what matters right now: the current focus, the next meeting, and the latest useful file. It is meant to save you from hunting around.",
    },
    {
      selector: "[data-metrics]",
      title: "Workspace pulse",
      body: "These numbers are your at-a-glance count of projects, documents, open work, goals, and metrics. If something feels missing, it usually means Scout or the team has not added that record yet.",
    },
    {
      selector: "[data-next-steps]",
      title: "Next best actions",
      body: "Scout keeps the most practical next moves here. Think of this as the short list for getting the pilot ready without reading the whole portal.",
    },
    {
      selector: "[data-tour-steps]",
      title: "Setup tours",
      body: "These are guided walkthroughs Scout prepared from your conversation. Each one opens a specific part of the portal and explains how it supports the project.",
    },
    {
      selector: "[data-timeline]",
      title: "Recent movement",
      body: "This area records important workspace activity, like Scout creating the account, documents being added, or meetings being scheduled.",
    },
  ],
  documents: [
    {
      selector: "[data-document-upload-trigger]",
      title: "Upload source material",
      body: "Use this when you have files Scout or the project team should review: exports, screenshots, PDFs, sample forms, SOPs, or de-identified examples.",
    },
    {
      selector: "[data-folder-toggle]",
      title: "Organize as you go",
      body: "Folders keep discovery materials tidy. A simple structure is best at first: sample data, policies, reports, screenshots, and deliverables.",
    },
    {
      selector: ".document-location",
      title: "Know where you are",
      body: "This shows the folder you are currently viewing. Scout wants this to feel like a calm filing cabinet, not a mystery drawer.",
    },
    {
      selector: "[data-document-dropzone]",
      title: "Drag, drop, and review",
      body: "The document table is where uploaded files and folders appear. Drag files into folders when you want to group material for the team.",
    },
  ],
  projects: [
    {
      selector: "[data-project-picker]",
      title: "Pick the project",
      body: "Use this dropdown to switch between projects. Scout-created accounts usually start with the first practical pilot from your conversation.",
    },
    {
      selector: "[data-project-scout-open]",
      title: "Create another project",
      body: "If a new idea comes up, Scout can talk it through with you and turn it into another project workspace.",
    },
    {
      selector: "[data-project-summary]",
      title: "Scope in plain English",
      body: "This summary gives the project stage, scope, and record counts. It is the quick sanity check before reading the detailed sections below.",
    },
    {
      selector: ".project-dashboard",
      title: "Project records",
      body: "Milestones, estimates, payments, invoices, and SOWs live here. Scout may draft planning records, but Conneen AI still reviews and approves real quotes.",
    },
  ],
  knowledge: [
    {
      selector: ".knowledge-commandbar",
      title: "Scout's memory shelf",
      body: "Knowledge is where Scout and admins keep business context, workflows, decisions, goals, notes, and other background that shapes the work.",
    },
    {
      selector: "[data-knowledge-add]",
      title: "Add context",
      body: "Use this to add structured knowledge. The type you choose changes the fields so the information lands in the right shape.",
    },
    {
      selector: ".knowledge-table",
      title: "Open any item",
      body: "Click a knowledge row to read it in a pop-up. Scout keeps titles, types, and dates visible so you can scan the library quickly.",
    },
  ],
  work: [
    {
      selector: ".work-tabs",
      title: "Tasks and user stories",
      body: "Tasks show the day-to-day work board. User stories show the higher-level needs, with attached tasks tucked underneath.",
    },
    {
      selector: "[data-work-project-filter]",
      title: "Filter by project",
      body: "When there is more than one project, this keeps the board focused on the work you care about right now.",
    },
    {
      selector: "[data-task-board]",
      title: "Work in columns",
      body: "Tasks move from to-do through review and completion. Admins can move everything; clients can move tasks assigned to them.",
    },
    {
      selector: "[data-story-list]",
      title: "Story backlog",
      body: "This list groups work by user story. Expand a story to see the tasks that make that outcome real.",
    },
  ],
  support: [
    {
      selector: "[data-meeting-form]",
      title: "Schedule time",
      body: "Use this form to book a meeting during available Alaska-time hours. Once a time is booked, other users cannot schedule over it.",
    },
    {
      selector: "[data-meeting-slots]",
      title: "Choose a slot",
      body: "Available times are shown here. Pick one, add a short agenda, and Scout will keep it visible in the portal.",
    },
    {
      selector: "[data-upcoming-meetings]",
      title: "Upcoming meetings",
      body: "This list shows what is already on the calendar so everyone knows what is coming next.",
    },
    {
      selector: "[data-support-timeline]",
      title: "Delivery timeline",
      body: "Scout groups meetings, milestone dates, task due dates, and project targets here so the project has a single timeline.",
    },
  ],
  ai: [
    {
      selector: "[data-ai-form]",
      title: "Ask portal Scout",
      body: "Use this Scout when you want answers from the client workspace: summaries, next actions, scope drafts, or meeting prep.",
    },
    {
      selector: "[data-ai-output]",
      title: "Scout's response",
      body: "Results appear here. If you choose to save an answer, it becomes internal knowledge for later reference.",
    },
  ],
  admin: [
    {
      selector: "[data-admin-metrics]",
      title: "Admin pulse",
      body: "This gives Conneen AI a quick view of client, project, task, lead, and invoice activity.",
    },
    {
      selector: "[data-client-form]",
      title: "Create clients",
      body: "Admins can create client workspaces directly when the lead did not come through Scout.",
    },
    {
      selector: "[data-user-form]",
      title: "Invite users",
      body: "This creates portal invites for clients, collaborators, and admins.",
    },
  ],
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body instanceof FormData ? options.headers : {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `${path} failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function showView(name) {
  qsa("[data-view]").forEach((view) => {
    view.hidden = view.dataset.view !== name;
  });
}

function showAuthMode(name) {
  qsa("[data-auth-panel]").forEach((panel) => {
    const isActive = panel.dataset.authPanel === name;
    panel.hidden = !isActive;
    panel.style.display = isActive ? "" : "none";
  });
}

function showSection(name, options = {}) {
  if (!options.preserveWalkthrough) closeWalkthrough(false);
  qsa(".portal-view").forEach((section) => {
    section.classList.toggle("active", section.dataset.section === name);
  });
  qsa("[data-nav]").forEach((button) => {
    const active = button.dataset.nav === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  qs("[data-active-title]").textContent = name === "ai" ? "Scout AI" : name.charAt(0).toUpperCase() + name.slice(1);
  const subtitle = qs("[data-active-subtitle]");
  if (subtitle) subtitle.textContent = pageSubtitles[name] || "";
  qs(".portal-sidebar")?.classList.remove("open");
}

function ensureWalkthroughElements() {
  let root = qs("[data-walkthrough]");
  if (root) return root;

  root = document.createElement("section");
  root.className = "walkthrough";
  root.dataset.walkthrough = "";
  root.hidden = true;
  root.innerHTML = `
    <div class="walkthrough-scrim" data-walkthrough-close></div>
    <div class="walkthrough-highlight" data-walkthrough-highlight></div>
    <article class="walkthrough-card" data-walkthrough-card role="dialog" aria-modal="true" aria-live="polite">
      <p class="eyebrow" data-walkthrough-kicker>Scout tour</p>
      <h2 data-walkthrough-title></h2>
      <p data-walkthrough-body></p>
      <div class="walkthrough-progress" data-walkthrough-progress></div>
      <footer>
        <button class="secondary" type="button" data-walkthrough-prev>Back</button>
        <button type="button" data-walkthrough-next>Next</button>
        <button class="link-button" type="button" data-walkthrough-close>Done</button>
      </footer>
    </article>
  `;
  document.body.appendChild(root);
  qsa("[data-walkthrough-close]", root).forEach((button) => {
    button.addEventListener("click", () => closeWalkthrough());
  });
  qs("[data-walkthrough-prev]", root)?.addEventListener("click", () => moveWalkthrough(-1));
  qs("[data-walkthrough-next]", root)?.addEventListener("click", () => moveWalkthrough(1));
  return root;
}

function availableWalkthroughSteps(section) {
  return (walkthroughs[section] || []).filter((step) => {
    const el = qs(step.selector);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

function positionWalkthrough() {
  if (!walkthroughState) return;
  const root = ensureWalkthroughElements();
  const step = walkthroughState.steps[walkthroughState.index];
  const target = qs(step?.selector || "");
  const highlight = qs("[data-walkthrough-highlight]", root);
  const card = qs("[data-walkthrough-card]", root);
  if (!target || !highlight || !card) return;

  const rect = target.getBoundingClientRect();
  const pad = 8;
  const top = Math.max(8, rect.top - pad);
  const left = Math.max(8, rect.left - pad);
  const width = Math.min(window.innerWidth - left - 8, rect.width + pad * 2);
  const height = Math.min(window.innerHeight - top - 8, rect.height + pad * 2);
  highlight.style.setProperty("--walkthrough-top", `${top}px`);
  highlight.style.setProperty("--walkthrough-left", `${left}px`);
  highlight.style.setProperty("--walkthrough-width", `${width}px`);
  highlight.style.setProperty("--walkthrough-height", `${height}px`);

  const cardWidth = Math.min(380, window.innerWidth - 32);
  const preferBelow = rect.bottom + 24 + 220 < window.innerHeight;
  const cardTop = preferBelow ? rect.bottom + 20 : Math.max(16, rect.top - 236);
  const cardLeft = Math.min(Math.max(16, rect.left), window.innerWidth - cardWidth - 16);
  card.style.width = `${cardWidth}px`;
  card.style.top = `${cardTop}px`;
  card.style.left = `${cardLeft}px`;
}

function renderWalkthroughStep() {
  if (!walkthroughState) return;
  const root = ensureWalkthroughElements();
  const step = walkthroughState.steps[walkthroughState.index];
  const target = qs(step.selector);
  if (!target) {
    moveWalkthrough(1);
    return;
  }

  qsa(".walkthrough-target").forEach((el) => el.classList.remove("walkthrough-target"));
  target.classList.add("walkthrough-target");
  target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

  qs("[data-walkthrough-kicker]", root).textContent = `Scout ${walkthroughState.section} tour`;
  qs("[data-walkthrough-title]", root).textContent = step.title;
  qs("[data-walkthrough-body]", root).textContent = step.body;
  qs("[data-walkthrough-progress]", root).textContent = `${walkthroughState.index + 1} of ${walkthroughState.steps.length}`;
  qs("[data-walkthrough-prev]", root).disabled = walkthroughState.index === 0;
  qs("[data-walkthrough-next]", root).textContent = walkthroughState.index === walkthroughState.steps.length - 1 ? "Finish" : "Next";

  window.setTimeout(positionWalkthrough, 180);
}

function setupTourStorageKey() {
  return `portal-setup-tour-complete:${activeClientId() || "default"}`;
}

function setupTourWasDismissed() {
  try {
    return localStorage.getItem(setupTourStorageKey()) === "1";
  } catch {
    return false;
  }
}

function dismissSetupTourPanel() {
  state.setupTourDismissedClientId = activeClientId() || "default";
  try {
    localStorage.setItem(setupTourStorageKey(), "1");
  } catch {
    // Local storage is best-effort; completion is still persisted server-side.
  }
  const panel = qs("[data-tour-steps]")?.closest(".tour-panel");
  if (panel) panel.hidden = true;
}

function allSetupToursComplete(steps = state.dashboard?.tourSteps || []) {
  return Boolean(steps.length) && steps.every((step) => Boolean(step.completed_at));
}

function findTourStep(tourId, section) {
  const steps = state.dashboard?.tourSteps || [];
  if (tourId) return steps.find((step) => String(step.id) === String(tourId));
  const matching = steps.filter((step) => (step.portal_section || "dashboard") === (section || "dashboard"));
  return matching.length === 1 ? matching[0] : null;
}

function isTourStepComplete(tourId, section) {
  const step = findTourStep(tourId, section);
  return Boolean(step?.completed_at);
}

function renderSetupTour() {
  const tourMount = qs("[data-tour-steps]");
  if (!tourMount) return;

  const panel = tourMount.closest(".tour-panel");
  const steps = state.dashboard?.tourSteps || [];
  window.clearTimeout(setupTourCompletionTimer);

  if (!steps.length) {
    if (panel) panel.hidden = false;
    tourMount.innerHTML = `<p class="empty">Scout has not created setup tour steps yet.</p>`;
    return;
  }

  if (allSetupToursComplete(steps)) {
    if (state.setupTourDismissedClientId === (activeClientId() || "default") || setupTourWasDismissed()) {
      if (panel) panel.hidden = true;
      return;
    }

    if (panel) panel.hidden = false;
    tourMount.innerHTML = `
      <div class="tour-complete">
        <span class="tour-check" aria-hidden="true">✓</span>
        <div>
          <strong>Setup tour complete</strong>
          <p>Nice work. Scout has shown you around the workspace, so this setup guide will tuck itself away.</p>
        </div>
      </div>
    `;
    setupTourCompletionTimer = window.setTimeout(dismissSetupTourPanel, 3200);
    return;
  }

  if (state.setupTourDismissedClientId === (activeClientId() || "default")) {
    state.setupTourDismissedClientId = "";
  }
  try {
    localStorage.removeItem(setupTourStorageKey());
  } catch {
    // Ignore storage failures; the live records still drive the UI.
  }
  if (panel) panel.hidden = false;
  tourMount.innerHTML = steps.map((step, index) => {
    const complete = Boolean(step.completed_at);
    const section = step.portal_section || "dashboard";
    return `
      <article class="tour-step ${complete ? "completed" : ""}">
        <span>${complete ? '<span class="tour-check" aria-label="Completed">✓</span>' : String(index + 1).padStart(2, "0")}</span>
        <div>
          <strong>${escapeHtml(step.title)}</strong>
          <p>${escapeHtml(step.body || "")}</p>
          <button class="link-button" type="button" ${complete ? "disabled" : ""} data-tour-id="${escapeHtml(step.id || "")}" data-tour-nav="${escapeHtml(section)}">
            ${complete ? "Tour complete" : `Open ${escapeHtml(section)} tour`}
          </button>
        </div>
      </article>
    `;
  }).join("");

  qsa("[data-tour-nav]", tourMount).forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      startWalkthrough(button.dataset.tourNav || "dashboard", button.dataset.tourId || "");
    });
  });
}

function startWalkthrough(section, tourId = "") {
  const normalized = section || "dashboard";
  if (isTourStepComplete(tourId, normalized)) {
    showToast("That setup tour is already complete.");
    return;
  }
  closeWalkthrough(false);
  showSection(normalized, { preserveWalkthrough: true });
  const steps = availableWalkthroughSteps(normalized);
  if (!steps.length) {
    showToast("Scout does not have a walkthrough for that section yet.", "error");
    return;
  }

  const root = ensureWalkthroughElements();
  walkthroughState = { section: normalized, tourId, steps, index: 0 };
  document.body.classList.add("walkthrough-active");
  root.hidden = false;
  renderWalkthroughStep();
}

async function completeWalkthrough() {
  if (!walkthroughState) return;
  const current = walkthroughState;
  if (!current.tourId) {
    closeWalkthrough(false);
    showToast("Tour complete.");
    return;
  }

  const completedAt = new Date().toISOString();
  try {
    await api("/api/portal/records/tour_steps", {
      method: "PATCH",
      body: JSON.stringify({
        id: current.tourId,
        client_id: activeClientId(),
        completed_at: completedAt,
      }),
    });
    const tourStep = findTourStep(current.tourId, current.section);
    if (tourStep) tourStep.completed_at = completedAt;
    closeWalkthrough(false);
    renderSetupTour();
    if (!allSetupToursComplete()) showToast("Tour complete.");
  } catch (error) {
    showToast(error.message || "Could not save tour completion.", "error");
  }
}

async function moveWalkthrough(delta) {
  if (!walkthroughState) return;
  const nextIndex = walkthroughState.index + delta;
  if (nextIndex >= walkthroughState.steps.length) {
    await completeWalkthrough();
    return;
  }
  walkthroughState.index = Math.max(0, nextIndex);
  renderWalkthroughStep();
}

function closeWalkthrough(showDoneToast = false) {
  if (!walkthroughState && !qs("[data-walkthrough]")) return;
  walkthroughState = null;
  document.body.classList.remove("walkthrough-active");
  qsa(".walkthrough-target").forEach((el) => el.classList.remove("walkthrough-target"));
  const root = qs("[data-walkthrough]");
  if (root) root.hidden = true;
  if (showDoneToast) showToast("Tour closed.");
}

function activeClientId() {
  const picker = qs("[data-client-picker]");
  return state.isAdmin ? picker?.value || state.clientId : state.clientId;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString();
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value ?? 0}</strong></div>`;
}

function emptyState(title, body, action = "") {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
      ${action}
    </div>
  `;
}

function sourcePill(row = {}) {
  const text = [row.source_type, row.title, row.name, row.summary, row.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (row.diagnostic_lead_id || text.includes("scout")) {
    return `<span class="source-pill scout-source">Scout-created</span>`;
  }
  return "";
}

function statusBadge(value, fallback = "Status") {
  const label = String(value || fallback).replace(/_/g, " ");
  return `<span class="status-badge">${escapeHtml(label)}</span>`;
}

function summarizeText(value, max = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeMultiline(value) {
  return escapeHtml(value || "").replace(/\n/g, "<br />");
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function formatFileSize(value) {
  const size = Number(value || 0);
  if (!size) return "";
  const units = ["B", "KB", "MB", "GB"];
  let unit = 0;
  let display = size;
  while (display >= 1024 && unit < units.length - 1) {
    display /= 1024;
    unit += 1;
  }
  return `${display >= 10 || unit === 0 ? Math.round(display) : display.toFixed(1)} ${units[unit]}`;
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatDateTime(value, options = {}) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  });
}

function formatAlaskaTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    timeZone: "America/Anchorage",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatAlaskaSlot(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString(undefined, {
    timeZone: "America/Anchorage",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function timelineDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

function formatTimelineDate(value) {
  const text = String(value || "");
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return formatDate(`${text}T12:00:00`);
  }
  return formatDateTime(text);
}

function titleForRow(config, row) {
  return row[config.title] || row.title || row.name || row.question || row.invoice_number || "Untitled";
}

function knowledgeTitle(section, row) {
  if (section === "faqs") return row.question || "Untitled FAQ";
  if (section === "workflows") return row.name || "Untitled workflow";
  if (section === "success_metrics") return row.name || "Untitled metric";
  return row.title || row.name || row.question || "Untitled knowledge";
}

function knowledgeRecordKey(section, row) {
  return `${section}:${row.id}`;
}

function displayValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value ?? "").trim();
}

function compactPayload(payload, emptyKeys = []) {
  const cleaned = { ...payload };
  emptyKeys.forEach((key) => {
    if (cleaned[key] === "") delete cleaned[key];
  });
  return cleaned;
}

function normalizeTaskStatus(status) {
  const value = String(status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "done" || value === "completed") return "complete";
  if (value === "doing" || value === "in_progress") return "in_work";
  if (value === "review") return "out_for_review";
  return workStatuses.some((item) => item.value === value) ? value : "todo";
}

function taskTypeLabel(value) {
  return taskTypeLabels[value] || "Development";
}

function taskHasCustomerForm(task = {}) {
  const schema = task.form_schema;
  return Boolean(schema && typeof schema === "object" && Array.isArray(schema.fields) && schema.fields.length);
}

function taskFormIsComplete(task = {}) {
  return Boolean(task.form_response || task.completed_at || normalizeTaskStatus(task.status) === "complete");
}

function normalizeUploadItems(task = {}) {
  return Array.isArray(task.upload_items)
    ? task.upload_items
        .filter((item) => item && typeof item === "object" && (item.title || item.name))
        .map((item, index) => ({
          id: String(item.id || item.key || `upload_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80),
          title: String(item.title || item.name || `Document ${index + 1}`).slice(0, 180),
          description: String(item.description || item.instructions || item.requested_items || "").slice(0, 1200),
          category: String(item.category || "requested document").slice(0, 120),
          uploaded_document_id: item.uploaded_document_id || "",
          uploaded_file_name: item.uploaded_file_name || "",
          uploaded_at: item.uploaded_at || "",
        }))
    : [];
}

function taskHasUploads(task = {}) {
  return normalizeUploadItems(task).length > 0;
}

function taskUploadsComplete(task = {}) {
  const items = normalizeUploadItems(task);
  return Boolean(items.length) && items.every((item) => item.uploaded_document_id);
}

function uploadTaskButton(task = {}) {
  if (!taskHasUploads(task) || taskUploadsComplete(task)) return "";
  return `<button class="task-form-button" type="button" data-task-upload-open="${escapeHtml(task.id || "")}">Upload documents</button>`;
}

function formTaskButton(task = {}) {
  if (!taskHasCustomerForm(task) || taskFormIsComplete(task)) return "";
  return `<button class="task-form-button" type="button" data-task-form-open="${escapeHtml(task.id || "")}">Complete now</button>`;
}

function userName(userId) {
  if (!userId) return "Unassigned";
  const name = userId === state.user?.id
    ? state.user.display_name || "You"
    : state.workRecords.users.find((user) => user.id === userId)?.display_name || "Assigned user";
  if (name === "You" || name === "Assigned user") return name;
  return String(name).trim().split(/\s+/)[0] || name;
}

function projectName(projectId) {
  return state.workRecords.projects.find((project) => project.id === projectId)?.name || "";
}

function zonedDateTimeToUtcIso(dateText, hour, minute = 0, timeZone = "America/Anchorage") {
  const [year, month, day] = dateText.split("-").map(Number);
  if (!year || !month || !day) return "";
  let utc = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  for (let index = 0; index < 3; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(utc)).map((part) => [part.type, part.value]));
    const seen = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const wanted = Date.UTC(year, month - 1, day, hour, minute);
    utc += wanted - seen;
  }
  return new Date(utc).toISOString();
}

function alaskaWeekday(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Anchorage", weekday: "short" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function overlaps(startIso, durationMinutes, busyStartIso, busyDurationMinutes) {
  const start = new Date(startIso).getTime();
  const end = start + Number(durationMinutes || 60) * 60000;
  const busyStart = new Date(busyStartIso).getTime();
  const busyEnd = busyStart + Number(busyDurationMinutes || 60) * 60000;
  return start < busyEnd && busyStart < end;
}

function fieldControl([name, label, type]) {
  if (type === "textarea") {
    return `<label>${label}<textarea name="${name}"></textarea></label>`;
  }
  if (type === "visibility") {
    return `<label>${label}<select name="${name}"><option value="shared">Client visible</option><option value="internal">Internal only</option></select></label>`;
  }
  return `<label>${label}<input name="${name}" type="${type || "text"}" /></label>`;
}

function renderRecordPanel(section) {
  const mount = qs(`[data-record-panel="${section}"]`);
  if (!mount) return;
  const config = sectionConfig[section];
  mount.innerHTML = `
    <section class="portal-panel record-panel">
      <div class="panel-heading">
        <h2>${config.label}</h2>
      </div>
      <form data-record-form="${section}" class="compact-form">
        ${config.fields.map(fieldControl).join("")}
        <button type="submit">Add</button>
      </form>
      <div data-record-list="${section}" class="record-list"></div>
    </section>
  `;
  qs(`[data-record-form="${section}"]`, mount).addEventListener("submit", handleRecordSubmit);
}

async function loadRecords(section) {
  if (section === "documents") {
    await loadDocumentLibrary();
    return;
  }
  if (section === "projects") {
    await loadProjectWorkspace();
    return;
  }
  if (section === "tasks") {
    await loadWorkBoard();
    return;
  }
  if (knowledgeSections.includes(section)) {
    await loadKnowledgeLibrary();
    return;
  }

  const config = sectionConfig[section];
  if (!config || !activeClientId()) return;
  const list = qs(`[data-record-list="${section}"]`);
  if (!list) return;
  const data = await api(`/api/portal/records/${section}?clientId=${encodeURIComponent(activeClientId())}`);
  list.innerHTML = data.rows.length
    ? data.rows.map((row) => `
      <article class="record-row">
        <strong>${titleForRow(config, row)}</strong>
        <span>${row.status || row.category || row.priority || row.review_status || ""}</span>
        <p>${summarizeText(row.description || row.content || row.notes || row.decision || row.scope || row.body || row.summary)}</p>
      </article>
    `).join("")
    : `<p class="empty">No records yet.</p>`;
}

function currentFolder() {
  return state.documentFolders.find((folder) => folder.id === state.documentFolderId) || null;
}

function folderPath(folderId = state.documentFolderId) {
  const path = [];
  let cursor = state.documentFolders.find((folder) => folder.id === folderId);
  const guard = new Set();
  while (cursor && !guard.has(cursor.id)) {
    path.unshift(cursor);
    guard.add(cursor.id);
    cursor = state.documentFolders.find((folder) => folder.id === cursor.parent_folder_id);
  }
  return path;
}

function renderDocumentBreadcrumbs() {
  const mount = qs("[data-document-breadcrumbs]");
  const title = qs("[data-document-location-title]");
  if (!mount) return;
  const path = folderPath();
  mount.innerHTML = [
    `<button type="button" class="breadcrumb-button" data-folder-open="">Documents</button>`,
    ...path.map((folder) => `<button type="button" class="breadcrumb-button" data-folder-open="${folder.id}">${escapeHtml(folder.name)}</button>`),
  ].join(`<span>/</span>`);
  if (title) title.textContent = path.length ? path[path.length - 1].name : "Documents";
}

function renderDocumentUploadRequests() {
  const mount = qs("[data-document-upload-requests]");
  if (!mount) return;
  const tasks = (state.documentUploadTasks || []).filter((task) => taskHasUploads(task) && !taskUploadsComplete(task));
  const items = tasks.flatMap((task) =>
    normalizeUploadItems(task)
      .filter((item) => !item.uploaded_document_id)
      .map((item) => ({ task, item }))
  );

  if (!items.length) {
    mount.innerHTML = "";
    return;
  }

  mount.innerHTML = `
    <section class="portal-panel upload-request-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Requested uploads</p>
          <h2>Documents Scout needs</h2>
        </div>
      </div>
      <div class="upload-request-list">
        ${items.map(({ task, item }) => `
          <article class="upload-request-row">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.description || task.description || "Upload this file for Scout and the team to review.")}</p>
              <small>${escapeHtml(task.title || "Upload task")}</small>
            </div>
            <button type="button" data-task-upload-open="${escapeHtml(task.id)}">Upload</button>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDocumentLibrary() {
  const list = qs(`[data-record-list="documents"]`);
  if (!list) return;
  renderDocumentBreadcrumbs();
  renderDocumentUploadRequests();

  const folders = state.documentFolders.filter((folder) => (folder.parent_folder_id || "") === state.documentFolderId);
  const documents = state.documentRows.filter((doc) => (doc.folder_id || "") === state.documentFolderId);

  if (!folders.length && !documents.length) {
    list.innerHTML = emptyState(
      "Nothing here yet.",
      "Upload a document or create a folder to start organizing this workspace.",
      `<button type="button" data-empty-upload>Upload document</button>`
    );
  } else {
    list.innerHTML = [
      ...folders.map((folder) => `
        <button class="library-row library-item folder-row" type="button" data-folder-open="${folder.id}" data-folder-drop="${folder.id}">
          <span><span class="file-icon folder-icon" aria-hidden="true"></span>${escapeHtml(folder.name)}</span>
          <span>Folder</span>
          <span>${formatDate(folder.updated_at || folder.created_at)}</span>
          <span></span>
        </button>
      `),
      ...documents.map((doc) => `
        <div class="library-row library-item file-row" draggable="true" data-document-id="${doc.id}">
          <span><span class="file-icon document-icon" aria-hidden="true"></span>${escapeHtml(doc.title || doc.file_name || "Untitled")}</span>
          <span>${escapeHtml(doc.file_type || doc.category || "Document")}</span>
          <span>${formatDate(doc.updated_at || doc.created_at)}</span>
          <span>${formatFileSize(doc.file_size)}</span>
        </div>
      `),
    ].join("");
  }

  qsa("[data-folder-open]").forEach((button) => {
    button.addEventListener("click", () => {
      state.documentFolderId = button.dataset.folderOpen || "";
      renderDocumentLibrary();
    });
  });

  qs("[data-empty-upload]", list)?.addEventListener("click", () => {
    qs(`[data-upload-form] input[type="file"]`)?.click();
  });

  qsa("[data-document-id]").forEach((row) => {
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", row.dataset.documentId || "");
    });
  });

  qsa("[data-folder-drop]").forEach((row) => {
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", async (event) => {
      event.preventDefault();
      row.classList.remove("drag-over");
      const documentId = event.dataTransfer.getData("text/plain");
      if (documentId) await moveDocumentToFolder(documentId, row.dataset.folderDrop || "");
    });
  });
}

async function loadDocumentLibrary() {
  const clientId = activeClientId();
  if (!clientId) return;
  if (state.documentClientId !== clientId) {
    state.documentFolderId = "";
    state.documentClientId = clientId;
  }

  const [folderData, documentData, taskData] = await Promise.all([
    api(`/api/portal/document-folders?clientId=${encodeURIComponent(clientId)}`).catch((error) => {
      setStatus(error.message || "Could not load document folders.", true);
      return { folders: [] };
    }),
    api(`/api/portal/records/documents?clientId=${encodeURIComponent(clientId)}`),
    api(`/api/portal/records/tasks?clientId=${encodeURIComponent(clientId)}`).catch(() => ({ rows: [] })),
  ]);
  state.documentFolders = folderData.folders || [];
  state.documentRows = documentData.rows || [];
  state.documentUploadTasks = taskData.rows || [];
  if (state.documentFolderId && !state.documentFolders.some((folder) => folder.id === state.documentFolderId)) {
    state.documentFolderId = "";
  }
  renderDocumentLibrary();
}

async function uploadDocumentFiles(files) {
  const clientId = activeClientId();
  if (!clientId || !files?.length) return;
  const form = qs("[data-upload-form]");
  const folder = currentFolder();
  setStatus(`Uploading ${files.length} document${files.length === 1 ? "" : "s"}...`);

  for (const file of files) {
    const formData = new FormData(form);
    formData.set("clientId", clientId);
    formData.set("folderId", state.documentFolderId);
    formData.set("title", file.name);
    formData.set("category", folder?.name || "general");
    formData.set("visibility", "shared");
    formData.set("file", file);
    await api("/api/portal/upload", { method: "POST", body: formData, headers: {} });
  }

  form.reset();
  setStatus("");
  showToast(`${files.length} document${files.length === 1 ? "" : "s"} uploaded.`);
  await loadDocumentLibrary();
  await loadDashboard();
}

async function moveDocumentToFolder(documentId, folderId) {
  if (!documentId || !folderId || !activeClientId()) return;
  await api("/api/portal/records/documents", {
    method: "PATCH",
    body: JSON.stringify({
      id: documentId,
      client_id: activeClientId(),
      folder_id: folderId,
    }),
  });
  showToast("Document moved.");
  await loadDocumentLibrary();
}

function renderKnowledgeLibrary() {
  const list = qs("[data-knowledge-list]");
  if (!list) return;

  const records = [...state.knowledgeRecords].sort((a, b) => {
    const aTime = new Date(a.row.created_at || 0).getTime();
    const bTime = new Date(b.row.created_at || 0).getTime();
    return bTime - aTime;
  });

  list.innerHTML = records.length
    ? records.map(({ section, row }) => {
        const config = sectionConfig[section];
        return `
          <button class="knowledge-row knowledge-item" type="button" data-knowledge-key="${knowledgeRecordKey(section, row)}">
            <span><strong>${escapeHtml(knowledgeTitle(section, row))}</strong>${sourcePill(row)}</span>
            <span>${escapeHtml(config?.label || section)}</span>
            <span>${escapeHtml(formatDate(row.created_at))}</span>
          </button>
        `;
      }).join("")
    : `
      ${emptyState(
        "No knowledge saved yet.",
        "Add the first Scout knowledge item to start building this client's memory.",
        `<button type="button" data-knowledge-empty-add>+ Add knowledge</button>`
      )}
    `;

  qsa("[data-knowledge-key]", list).forEach((button) => {
    button.addEventListener("click", () => openKnowledgeDetail(button.dataset.knowledgeKey || ""));
  });
  qs("[data-knowledge-empty-add]", list)?.addEventListener("click", openKnowledgeModal);
}

function openKnowledgeDetail(key) {
  const [section, id] = key.split(":");
  const found = state.knowledgeRecords.find((record) => record.section === section && record.row.id === id);
  const modal = qs("[data-knowledge-detail-modal]");
  if (!found || !modal) return;

  const config = sectionConfig[section];
  const row = found.row;
  qs("[data-knowledge-detail-type]").textContent = config?.label || section;
  qs("[data-knowledge-detail-title]").textContent = knowledgeTitle(section, row);
  qs("[data-knowledge-detail-date]").textContent = row.created_at ? `Created ${formatDate(row.created_at)}` : "";

  const fields = (config?.fields || [])
    .map(([name, label]) => {
      const value = displayValue(row[name]);
      if (!value) return "";
      return `
        <section class="knowledge-detail-field">
          <h3>${escapeHtml(label)}</h3>
          <p>${escapeHtml(value)}</p>
        </section>
      `;
    })
    .filter(Boolean);

  qs("[data-knowledge-detail-fields]").innerHTML = fields.length
    ? fields.join("")
    : `<p class="empty">No readable details have been saved for this knowledge item yet.</p>`;

  modal.hidden = false;
  qs("[data-knowledge-detail-close]")?.focus();
}

function closeKnowledgeDetail() {
  const modal = qs("[data-knowledge-detail-modal]");
  if (modal) modal.hidden = true;
}

async function loadKnowledgeLibrary() {
  const clientId = activeClientId();
  if (!clientId) return;
  state.knowledgeClientId = clientId;

  const results = await Promise.all(
    knowledgeSections.map((section) =>
      api(`/api/portal/records/${section}?clientId=${encodeURIComponent(clientId)}`).catch(() => ({ rows: [] }))
    )
  );

  state.knowledgeRecords = knowledgeSections.flatMap((section, index) =>
    (results[index].rows || []).map((row) => ({ section, row }))
  );
  renderKnowledgeLibrary();
}

function renderKnowledgeTypeOptions() {
  const select = qs("[data-knowledge-type]");
  if (!select) return;
  select.innerHTML = knowledgeSections
    .map((section) => `<option value="${section}">${sectionConfig[section]?.label || section}</option>`)
    .join("");
}

function renderKnowledgeFields() {
  const select = qs("[data-knowledge-type]");
  const mount = qs("[data-knowledge-fields]");
  if (!select || !mount) return;
  const config = sectionConfig[select.value];
  mount.innerHTML = config
    ? config.fields.map(fieldControl).join("")
    : `<p class="empty">Select a knowledge type.</p>`;
}

function openKnowledgeModal() {
  renderKnowledgeTypeOptions();
  renderKnowledgeFields();
  const modal = qs("[data-knowledge-modal]");
  if (!modal) return;
  modal.hidden = false;
  qs("[data-knowledge-fields] input, [data-knowledge-fields] textarea, [data-knowledge-fields] select")?.focus();
}

function closeKnowledgeModal() {
  const modal = qs("[data-knowledge-modal]");
  const form = qs("[data-knowledge-form]");
  if (form) form.reset();
  if (modal) modal.hidden = true;
}

async function handleKnowledgeSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const section = String(formData.get("knowledgeType") || "");
  if (!knowledgeSections.includes(section)) return;

  const payload = Object.fromEntries(formData.entries());
  delete payload.knowledgeType;
  payload.client_id = activeClientId();
  if (payload.tags) payload.tags = String(payload.tags).split(",").map((tag) => tag.trim()).filter(Boolean);

  await api(`/api/portal/records/${section}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  closeKnowledgeModal();
  showToast("Knowledge saved.");
  await loadKnowledgeLibrary();
  await loadDashboard();
}

function projectRows(section) {
  const projectId = state.selectedProjectId;
  return (state.projectRecords[section] || []).filter((row) => row.project_id === projectId);
}

function projectItemTitle(section, row) {
  if (section === "invoices") return row.invoice_number || row.title || "Draft invoice";
  return row.name || row.title || "Untitled";
}

function projectItemMeta(section, row) {
  if (section === "estimates") {
    const low = row.hour_range_low ? `${row.hour_range_low}h` : "";
    const high = row.hour_range_high ? `${row.hour_range_high}h` : "";
    return [row.approval_status || "draft", low && high ? `${low}-${high}` : low || high, row.hourly_rate ? `$${row.hourly_rate}/hr` : ""].filter(Boolean).join(" | ");
  }
  if (section === "payments") return [row.status || "planned", formatMoney(row.amount), row.due_date ? `due ${formatDate(row.due_date)}` : ""].filter(Boolean).join(" | ");
  if (section === "invoices") return [row.status || "draft", formatMoney(row.amount), row.due_date ? `due ${formatDate(row.due_date)}` : ""].filter(Boolean).join(" | ");
  if (section === "contracts") return [row.status || "draft", row.contract_type || "SOW", row.signed_at ? `signed ${formatDate(row.signed_at)}` : ""].filter(Boolean).join(" | ");
  return [row.status || "not started", row.stage || "", row.due_date ? `due ${formatDate(row.due_date)}` : ""].filter(Boolean).join(" | ");
}

function projectItemBody(section, row) {
  if (section === "estimates") return row.assumptions || "";
  if (section === "contracts") return row.notes || "";
  return row.notes || row.description || row.scope || "";
}

function projectRecordKey(section, row) {
  return `${section}:${row.id}`;
}

function renderProjectList(section) {
  const mount = qs(`[data-project-list="${section}"]`);
  if (!mount) return;
  const rows = projectRows(section);
  mount.innerHTML = rows.length
    ? rows.map((row) => `
      <button class="project-row project-record-button" type="button" data-project-record-key="${projectRecordKey(section, row)}">
        <div>
          <strong>${projectItemTitle(section, row)}</strong>
          <span>${projectItemMeta(section, row)}</span>
          ${sourcePill(row)}
        </div>
        <p>${summarizeText(projectItemBody(section, row), 260)}</p>
      </button>
    `).join("")
    : emptyState(`No ${section.replace("_", " ")} yet.`, "Scout or an admin can add records here as this project takes shape.");

  qsa("[data-project-record-key]", mount).forEach((button) => {
    button.addEventListener("click", () => openProjectDetail(button.dataset.projectRecordKey || ""));
  });
}

function openProjectDetail(key) {
  const [section, id] = key.split(":");
  const row = (state.projectRecords[section] || []).find((item) => item.id === id);
  const modal = qs("[data-project-detail-modal]");
  if (!row || !modal) return;

  const config = sectionConfig[section];
  qs("[data-project-detail-type]").textContent = config?.label || "Project record";
  qs("[data-project-detail-title]").textContent = projectItemTitle(section, row);
  qs("[data-project-detail-meta]").textContent = [projectItemMeta(section, row), row.created_at ? `Created ${formatDate(row.created_at)}` : ""].filter(Boolean).join(" | ");

  const fields = (config?.fields || [])
    .map(([name, label]) => {
      const value = displayValue(row[name]);
      if (!value) return "";
      return `
        <section class="knowledge-detail-field">
          <h3>${escapeHtml(label)}</h3>
          <p>${escapeHtml(value)}</p>
        </section>
      `;
    })
    .filter(Boolean);
  qs("[data-project-detail-fields]").innerHTML = fields.length
    ? fields.join("")
    : `<p class="empty">No readable details have been saved for this project record yet.</p>`;
  modal.hidden = false;
  qs("[data-project-detail-close]")?.focus();
}

function closeProjectDetail() {
  const modal = qs("[data-project-detail-modal]");
  if (modal) modal.hidden = true;
}

function renderProjectWorkspace() {
  const picker = qs("[data-project-picker]");
  const summary = qs("[data-project-summary]");
  if (!picker || !summary) return;

  const projects = [...(state.projectRecords.projects || [])].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
  );
  if (!state.selectedProjectId && projects[0]) state.selectedProjectId = projects[0].id;
  picker.innerHTML = projects.length
    ? [
        ...projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`),
        `<option value="__create__">Create new project...</option>`,
      ].join("")
    : `<option value="">No projects yet</option>`;
  picker.value = state.selectedProjectId || "";

  const project = projects.find((item) => item.id === state.selectedProjectId);
  if (!project) {
    summary.innerHTML = `
      <section class="portal-panel project-empty">
        <strong>No project selected.</strong>
        <p>Create a new project with Scout to set up milestones, estimates, payments, invoices, and contracts.</p>
        <button type="button" data-project-empty-create>Create project with Scout</button>
      </section>
    `;
  } else {
    summary.innerHTML = `
      <section class="portal-panel project-overview">
        <div>
          <p class="eyebrow">${escapeHtml(project.agile_stage || "Project")}</p>
          <h2>${escapeHtml(project.name)}</h2>
          <p>${escapeHtml(summarizeText(project.scope || project.goals || "No scope has been added yet.", 360))}</p>
          ${sourcePill(project)}
        </div>
        <div class="project-kpis">
          ${metric("Milestones", projectRows("milestones").length)}
          ${metric("Estimates", projectRows("estimates").length)}
          ${metric("Payments", projectRows("payments").length)}
          ${metric("Invoices", projectRows("invoices").length)}
          ${metric("SOWs", projectRows("contracts").length)}
        </div>
      </section>
    `;
  }

  ["milestones", "estimates", "payments", "invoices", "contracts"].forEach(renderProjectList);
  qs("[data-project-empty-create]")?.addEventListener("click", openProjectScout);
}

async function loadProjectWorkspace() {
  const clientId = activeClientId();
  if (!clientId) return;
  if (state.projectClientId !== clientId) {
    state.selectedProjectId = "";
    state.projectClientId = clientId;
  }

  const sections = ["projects", "milestones", "estimates", "payments", "invoices", "contracts"];
  const results = await Promise.all(
    sections.map((section) => api(`/api/portal/records/${section}?clientId=${encodeURIComponent(clientId)}`).catch(() => ({ rows: [] })))
  );

  sections.forEach((section, index) => {
    state.projectRecords[section] = results[index].rows || [];
  });

  if (!state.projectRecords.projects.length && state.dashboard?.projects?.length) {
    state.projectRecords.projects = state.dashboard.projects;
  }

  if (state.selectedProjectId && !state.projectRecords.projects.some((project) => project.id === state.selectedProjectId)) {
    state.selectedProjectId = "";
  }
  renderProjectWorkspace();
}

function addProjectScoutMessage(role, content) {
  const text = String(content || "").trim();
  if (!text) return;
  state.projectScoutMessages.push({ role, content: text });
  const log = qs("[data-project-scout-log]");
  if (!log) return;
  const div = document.createElement("div");
  div.className = `scout-bubble ${role}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function openProjectScout() {
  const scout = qs("[data-project-scout]");
  if (!scout) return;
  scout.hidden = false;
  if (!state.projectScoutMessages.length) {
    addProjectScoutMessage(
      "assistant",
      "Tell me what you want this project to accomplish, what should be delivered, any timing constraints, and how you will know it worked. I will turn that into a project workspace."
    );
  }
  qs(`[data-project-scout-form] textarea`)?.focus();
}

async function handleProjectScoutSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.message;
  const text = input.value.trim();
  if (!text) return;
  addProjectScoutMessage("user", text);
  input.value = "";

  try {
    const data = await api("/api/portal/project-scout", {
      method: "POST",
      body: JSON.stringify({ clientId: activeClientId(), action: "chat", messages: state.projectScoutMessages }),
    });
    addProjectScoutMessage("assistant", data.reply);
  } catch (error) {
    addProjectScoutMessage("assistant", error.message || "I could not process that project note.");
  }
}

async function handleProjectScoutCreate() {
  const userMessages = state.projectScoutMessages.filter((message) => message.role === "user");
  if (!userMessages.length) {
    addProjectScoutMessage("assistant", "Give me a short project description first, then I can create the workspace.");
    return;
  }

  setStatus("Scout is creating the project workspace...");
  try {
    const data = await api("/api/portal/project-scout", {
      method: "POST",
      body: JSON.stringify({ clientId: activeClientId(), action: "create", messages: state.projectScoutMessages }),
    });
    state.selectedProjectId = data.project.id;
    qs("[data-project-scout]").hidden = true;
    setStatus("");
    showToast("Project workspace created.");
    await loadProjectWorkspace();
    await loadDashboard();
  } catch (error) {
    setStatus(error.message || "Scout could not create the project.", true);
  }
}

function selectedWorkTasks() {
  return (state.workRecords.tasks || []).filter((task) => {
    if (!state.workProjectId) return true;
    return task.project_id === state.workProjectId;
  });
}

function selectedWorkStories() {
  return (state.workRecords.requirements || []).filter((story) => {
    if (!state.workProjectId) return true;
    return story.project_id === state.workProjectId;
  });
}

function canMoveTask(task) {
  return state.isAdmin || task.assigned_to === state.user?.id;
}

function renderWorkProjectFilter() {
  const picker = qs("[data-work-project-filter]");
  if (!picker) return;
  const projects = [...(state.workRecords.projects || [])].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
  );
  picker.innerHTML = [
    `<option value="">All projects</option>`,
    ...projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`),
  ].join("");
  if (state.workProjectId && !projects.some((project) => project.id === state.workProjectId)) {
    state.workProjectId = "";
  }
  picker.value = state.workProjectId;
}

function taskCard(task) {
  const movable = canMoveTask(task);
  const hours = task.expected_hours ? `${task.expected_hours}h expected` : "";
  const project = projectName(task.project_id);
  const status = workStatuses.find((item) => item.value === normalizeTaskStatus(task.status))?.label || "To-do";
  return `
    <article class="task-card${movable ? " movable" : ""}" draggable="${movable ? "true" : "false"}" data-task-id="${task.id}" data-task-open="${task.id}" tabindex="0">
      <div class="task-card-heading">
        <strong>${escapeHtml(task.title || "Untitled task")}</strong>
        <div class="task-badges">
          ${statusBadge(status)}
          <span class="type-badge">${escapeHtml(taskTypeLabel(task.task_type))}</span>
        </div>
      </div>
      <p>${escapeHtml(summarizeText(task.description, 180))}</p>
      <dl>
        ${project ? `<div><dt>Project</dt><dd>${escapeHtml(project)}</dd></div>` : ""}
        <div><dt>Assigned</dt><dd>${escapeHtml(userName(task.assigned_to))}</dd></div>
        ${hours ? `<div><dt>Hours</dt><dd>${escapeHtml(hours)}</dd></div>` : ""}
        ${task.due_date ? `<div><dt>Due</dt><dd>${escapeHtml(formatDate(task.due_date))}</dd></div>` : ""}
      </dl>
      ${task.success_metrics ? `<section><b>Success</b><p>${escapeHtml(summarizeText(task.success_metrics, 140))}</p></section>` : ""}
      ${task.risks ? `<section><b>Risks</b><p>${escapeHtml(summarizeText(task.risks, 140))}</p></section>` : ""}
      ${taskFormIsComplete(task) && taskHasCustomerForm(task) ? `<span class="task-complete-note">Form submitted</span>` : formTaskButton(task)}
      ${taskUploadsComplete(task) ? `<span class="task-complete-note">Documents uploaded</span>` : uploadTaskButton(task)}
    </article>
  `;
}

function openTaskDetail(taskId) {
  const task = (state.workRecords.tasks || []).find((item) => item.id === taskId);
  const modal = qs("[data-task-detail-modal]");
  if (!task || !modal) return;
  const status = workStatuses.find((item) => item.value === normalizeTaskStatus(task.status))?.label || "To-do";
  qs("[data-task-detail-type]").textContent = taskTypeLabel(task.task_type);
  qs("[data-task-detail-title]").textContent = task.title || "Untitled task";
  qs("[data-task-detail-meta]").textContent = [
    status,
    task.due_date ? `Due ${formatDate(task.due_date)}` : "",
    task.expected_hours ? `${task.expected_hours} expected hours` : "",
  ].filter(Boolean).join(" | ");

  const fields = [
    ["Description", task.description],
    ["Project", projectName(task.project_id)],
    ["Assigned", userName(task.assigned_to)],
    ["Success metrics", task.success_metrics],
    ["Risks", task.risks],
    ["Submitted answers", task.form_response ? JSON.stringify(task.form_response, null, 2) : ""],
    ["Visibility", task.visibility],
  ].map(([label, value]) => {
    const text = displayValue(value);
    if (!text) return "";
    return `
      <section class="knowledge-detail-field">
        <h3>${escapeHtml(label)}</h3>
        <p>${escapeHtml(text)}</p>
      </section>
    `;
  }).filter(Boolean);

  qs("[data-task-detail-fields]").innerHTML = fields.length
    ? fields.join("")
    : `<p class="empty">No task details have been saved yet.</p>`;
  const actions = qs("[data-task-detail-actions]");
  if (actions) {
    const formAction = taskHasCustomerForm(task)
      ? taskFormIsComplete(task)
        ? `<span class="task-complete-note">Customer form submitted and saved to Scout memory.</span>`
        : `<button type="button" data-task-form-open="${escapeHtml(task.id)}">Complete now</button>`
      : "";
    const uploadAction = taskHasUploads(task)
      ? taskUploadsComplete(task)
        ? `<span class="task-complete-note">Requested documents uploaded.</span>`
        : `<button type="button" data-task-upload-open="${escapeHtml(task.id)}">Upload documents</button>`
      : "";
    actions.innerHTML = [formAction, uploadAction].filter(Boolean).join("");
  }
  modal.hidden = false;
  qs("[data-task-detail-close]")?.focus();
}

function closeTaskDetail() {
  const modal = qs("[data-task-detail-modal]");
  if (modal) modal.hidden = true;
  const actions = qs("[data-task-detail-actions]");
  if (actions) actions.innerHTML = "";
}

function findTask(taskId) {
  return (state.workRecords.tasks || []).find((item) => item.id === taskId)
    || (state.supportRecords.tasks || []).find((item) => item.id === taskId)
    || (state.dashboard?.tasks || []).find((item) => item.id === taskId);
}

function normalizeFormFields(schema = {}) {
  return Array.isArray(schema.fields)
    ? schema.fields
        .filter((field) => field && typeof field === "object" && field.name && field.label)
        .map((field) => ({
          name: String(field.name).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80),
          label: String(field.label).slice(0, 180),
          type: ["text", "textarea", "select", "date", "number", "email"].includes(field.type) ? field.type : "text",
          required: Boolean(field.required),
          help: String(field.help || "").slice(0, 500),
          options: Array.isArray(field.options) ? field.options.map((option) => String(option).slice(0, 120)).filter(Boolean) : [],
        }))
        .filter((field) => field.name && field.label)
    : [];
}

function renderTaskFormControl(field) {
  const required = field.required ? "required" : "";
  const help = field.help ? `<small>${escapeHtml(field.help)}</small>` : "";
  if (field.type === "textarea") {
    return `<label>${escapeHtml(field.label)}<textarea name="${escapeHtml(field.name)}" ${required}></textarea>${help}</label>`;
  }
  if (field.type === "select") {
    return `
      <label>${escapeHtml(field.label)}
        <select name="${escapeHtml(field.name)}" ${required}>
          <option value="">Select one</option>
          ${field.options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}
        </select>
        ${help}
      </label>
    `;
  }
  return `<label>${escapeHtml(field.label)}<input name="${escapeHtml(field.name)}" type="${field.type}" ${required} />${help}</label>`;
}

function openTaskForm(taskId) {
  const task = findTask(taskId);
  const modal = qs("[data-task-form-modal]");
  const form = qs("[data-task-answer-form]");
  if (!task || !modal || !form || !taskHasCustomerForm(task)) return;
  if (taskFormIsComplete(task)) {
    showToast("That form has already been submitted.");
    return;
  }

  const fields = normalizeFormFields(task.form_schema);
  if (!fields.length) {
    showToast("Scout has not added questions to that task yet.", "error");
    return;
  }

  form.dataset.taskId = task.id;
  qs("[data-task-form-title]").textContent = task.form_schema.title || task.title || "Complete task";
  qs("[data-task-form-intro]").textContent = task.form_schema.intro || task.description || "Answer these questions so Scout can keep the workspace moving.";
  qs("[data-task-form-fields]").innerHTML = fields.map(renderTaskFormControl).join("");
  modal.hidden = false;
  qs("[data-task-form-fields] input, [data-task-form-fields] textarea, [data-task-form-fields] select")?.focus();
}

function closeTaskForm() {
  const modal = qs("[data-task-form-modal]");
  const form = qs("[data-task-answer-form]");
  if (form) {
    form.reset();
    form.dataset.taskId = "";
  }
  if (modal) modal.hidden = true;
}

function openTaskUpload(taskId) {
  const task = findTask(taskId);
  const modal = qs("[data-task-upload-modal]");
  const mount = qs("[data-task-upload-items]");
  if (!task || !modal || !mount || !taskHasUploads(task)) return;

  qs("[data-task-upload-title]").textContent = task.title || "Upload requested documents";
  qs("[data-task-upload-intro]").textContent = task.description || "Upload the files Scout needs to finish this part of setup.";
  mount.innerHTML = normalizeUploadItems(task).map((item) => {
    const done = Boolean(item.uploaded_document_id);
    return `
      <article class="task-upload-item ${done ? "complete" : ""}" data-upload-item="${escapeHtml(item.id)}">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.description || "Upload the requested file so Scout and the team can review it.")}</p>
          ${done ? `<span class="task-complete-note">${escapeHtml(item.uploaded_file_name || "Uploaded")}</span>` : ""}
        </div>
        ${done ? "" : `
          <label class="upload-file-picker">
            <span>Choose file</span>
            <input type="file" data-upload-file="${escapeHtml(item.id)}" />
          </label>
          <button type="button" data-upload-submit="${escapeHtml(item.id)}">Upload</button>
        `}
      </article>
    `;
  }).join("");

  qsa("[data-upload-submit]", mount).forEach((button) => {
    button.addEventListener("click", () => uploadRequestedDocument(task.id, button.dataset.uploadSubmit || ""));
  });

  modal.hidden = false;
  qs("[data-task-upload-close]")?.focus();
}

function closeTaskUpload() {
  const modal = qs("[data-task-upload-modal]");
  const mount = qs("[data-task-upload-items]");
  if (mount) mount.innerHTML = "";
  if (modal) modal.hidden = true;
}

async function uploadRequestedDocument(taskId, itemId) {
  const fileInput = qs(`[data-upload-file="${CSS.escape(itemId)}"]`);
  const file = fileInput?.files?.[0];
  if (!file) {
    showToast("Choose a file first.", "error");
    return;
  }

  const formData = new FormData();
  formData.set("clientId", activeClientId());
  formData.set("taskId", taskId);
  formData.set("itemId", itemId);
  formData.set("folderId", state.documentFolderId);
  formData.set("file", file);

  setStatus("Uploading requested document...");
  try {
    await api("/api/portal/task-uploads", { method: "POST", body: formData, headers: {} });
    setStatus("");
    showToast("Requested document uploaded.");
    closeTaskUpload();
    await Promise.all([
      loadDocumentLibrary().catch(() => {}),
      loadWorkBoard().catch(() => {}),
      loadDashboard().catch(() => {}),
      loadSupportTimeline().catch(() => {}),
    ]);
  } catch (error) {
    setStatus("");
    showToast(error.message || "Upload failed.", "error");
  }
}

async function handleTaskFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const taskId = form.dataset.taskId || "";
  const task = findTask(taskId);
  if (!task) return;

  const fields = normalizeFormFields(task.form_schema);
  const formData = new FormData(form);
  const answers = {};
  fields.forEach((field) => {
    answers[field.name] = String(formData.get(field.name) || "").trim();
  });

  await api("/api/portal/task-forms", {
    method: "POST",
    body: JSON.stringify({
      taskId,
      clientId: activeClientId(),
      answers,
    }),
  });

  closeTaskForm();
  closeTaskDetail();
  showToast("Submitted to Scout memory.");
  await Promise.all([
    loadWorkBoard().catch(() => {}),
    loadDashboard().catch(() => {}),
    loadKnowledgeLibrary().catch(() => {}),
    loadSupportTimeline().catch(() => {}),
  ]);
}

function renderTaskBoard() {
  const board = qs("[data-task-board]");
  if (!board) return;
  const tasks = selectedWorkTasks();
  board.innerHTML = workStatuses.map((status) => {
    const rows = tasks.filter((task) => normalizeTaskStatus(task.status) === status.value);
    return `
      <section class="task-column" data-task-status="${status.value}">
        <header>
          <h2>${status.label}</h2>
          <span>${rows.length}</span>
        </header>
        <div class="task-column-list">
          ${rows.length ? rows.map(taskCard).join("") : `<p class="empty column-empty">No ${status.label.toLowerCase()} tasks.</p>`}
        </div>
      </section>
    `;
  }).join("");

  qsa("[data-task-id]", board).forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("[data-task-form-open]")) return;
      openTaskDetail(card.dataset.taskId || "");
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openTaskDetail(card.dataset.taskId || "");
      }
    });
    card.addEventListener("dragstart", (event) => {
      if (card.getAttribute("draggable") !== "true") {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.dataset.taskId || "");
    });
  });

  qsa("[data-task-status]", board).forEach((column) => {
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      column.classList.add("drag-over");
    });
    column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
    column.addEventListener("drop", async (event) => {
      event.preventDefault();
      column.classList.remove("drag-over");
      const taskId = event.dataTransfer.getData("text/plain");
      if (taskId) await moveTask(taskId, column.dataset.taskStatus || "todo");
    });
  });
}

function renderStoryList() {
  const list = qs("[data-story-list]");
  if (!list) return;
  const stories = selectedWorkStories();
  const tasks = selectedWorkTasks();
  list.innerHTML = stories.length
    ? stories.map((story) => {
        const storyTasks = tasks.filter((task) => task.user_story_id === story.id);
        return `
          <details class="story-item">
            <summary>
              <span>
                <strong>${escapeHtml(story.title || "Untitled user story")}</strong>
                <small>${escapeHtml([story.status || "proposed", story.priority || ""].filter(Boolean).join(" | "))}</small>
              </span>
              <span>${storyTasks.length} task${storyTasks.length === 1 ? "" : "s"}</span>
            </summary>
            <p>${escapeHtml(story.description || "No story description yet.")}</p>
            ${story.acceptance_criteria ? `<section><b>Acceptance criteria</b><p>${escapeHtml(story.acceptance_criteria)}</p></section>` : ""}
            <div class="story-task-list">
              ${storyTasks.length ? storyTasks.map((task) => `
                <button type="button" data-story-task-open="${task.id}">
                  <strong>${escapeHtml(task.title || "Untitled task")}</strong>
                  <span>${escapeHtml(workStatuses.find((item) => item.value === normalizeTaskStatus(task.status))?.label || "To-do")} | ${escapeHtml(userName(task.assigned_to))}</span>
                </button>
                ${taskFormIsComplete(task) && taskHasCustomerForm(task) ? `<span class="task-complete-note">Form submitted</span>` : formTaskButton(task)}
                ${taskUploadsComplete(task) ? `<span class="task-complete-note">Documents uploaded</span>` : uploadTaskButton(task)}
              `).join("") : `<p class="empty">No tasks attached to this user story yet.</p>`}
            </div>
          </details>
        `;
      }).join("")
    : emptyState("No user stories yet.", "Scout or an admin can add user stories and attach tasks to them as the backlog matures.");
  qsa("[data-story-task-open]", list).forEach((button) => {
    button.addEventListener("click", () => openTaskDetail(button.dataset.storyTaskOpen || ""));
  });
}

function renderWorkWorkspace() {
  renderWorkProjectFilter();
  renderTaskBoard();
  renderStoryList();
}

async function loadWorkBoard() {
  const clientId = activeClientId();
  if (!clientId) return;
  if (state.workClientId !== clientId) {
    state.workProjectId = "";
    state.workClientId = clientId;
  }

  const [projectData, taskData, storyData, userData] = await Promise.all([
    api(`/api/portal/records/projects?clientId=${encodeURIComponent(clientId)}`).catch(() => ({ rows: [] })),
    api(`/api/portal/records/tasks?clientId=${encodeURIComponent(clientId)}`).catch(() => ({ rows: [] })),
    api(`/api/portal/records/requirements?clientId=${encodeURIComponent(clientId)}`).catch(() => ({ rows: [] })),
    api(`/api/portal/users?clientId=${encodeURIComponent(clientId)}`).catch(() => ({ users: [state.user].filter(Boolean) })),
  ]);

  state.workRecords.projects = projectData.rows || [];
  state.workRecords.tasks = taskData.rows || [];
  state.workRecords.requirements = storyData.rows || [];
  state.workRecords.users = userData.users || [];
  renderWorkWorkspace();
}

function renderMeetingProjects() {
  const select = qs("[data-meeting-project-select]");
  if (!select) return;
  select.innerHTML = [
    `<option value="">General meeting</option>`,
    ...state.supportRecords.projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`),
  ].join("");
}

function setDefaultMeetingDate() {
  const input = qs("[data-meeting-date]");
  if (!input || input.value) return;
  const date = new Date();
  for (let index = 0; index < 7; index += 1) {
    const dateText = date.toISOString().slice(0, 10);
    const weekday = alaskaWeekday(dateText);
    if (weekday !== "Sat" && weekday !== "Sun") {
      input.value = dateText;
      return;
    }
    date.setDate(date.getDate() + 1);
  }
}

function renderMeetingSlots() {
  const dateInput = qs("[data-meeting-date]");
  const slots = qs("[data-meeting-slots]");
  const eventInput = qs("[data-meeting-event-at]");
  if (!dateInput || !slots || !eventInput) return;
  eventInput.value = "";

  const dateText = dateInput.value;
  if (!dateText) {
    slots.innerHTML = `<p class="empty">Pick a date to see available Alaska-time meeting slots.</p>`;
    return;
  }

  const weekday = alaskaWeekday(dateText);
  if (weekday === "Sat" || weekday === "Sun") {
    slots.innerHTML = `<p class="empty">No meeting availability on weekends.</p>`;
    return;
  }

  const now = Date.now();
  const slotItems = [];
  for (let hour = 14; hour < 21; hour += 1) {
    const startIso = zonedDateTimeToUtcIso(dateText, hour);
    const booked = state.supportRecords.busySlots.some((event) => overlaps(startIso, 60, event.event_at, event.duration_minutes || 60));
    const past = new Date(startIso).getTime() <= now;
    slotItems.push({ startIso, booked, past });
  }

  slots.innerHTML = slotItems.map((slot) => {
    const disabled = slot.booked || slot.past;
    return `
      <button class="slot-button${disabled ? " unavailable" : ""}" type="button" data-slot-time="${slot.startIso}" ${disabled ? "disabled" : ""}>
        <span>${escapeHtml(formatAlaskaSlot(slot.startIso))}</span>
        <small>${slot.booked ? "Booked" : slot.past ? "Past" : "Available"}</small>
      </button>
    `;
  }).join("");

  qsa("[data-slot-time]", slots).forEach((button) => {
    button.addEventListener("click", () => {
      qsa("[data-slot-time]", slots).forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      eventInput.value = button.dataset.slotTime || "";
    });
  });
}

function timelineItem(date, label, title, body = "", task = null, event = null) {
  return { date, label, title, body, task, event, eventId: event?.id || "" };
}

function meetingActions(event = {}) {
  const joinUrl = event.meeting_url || (isUrl(event.location) ? event.location : "");
  return `
    <div class="meeting-actions">
      ${joinUrl ? `<a class="button-link" href="${escapeHtml(joinUrl)}" target="_blank" rel="noreferrer">Join meeting</a>` : ""}
      <button class="secondary" type="button" data-meeting-scout-open="${escapeHtml(event.id || "")}">Scout notes</button>
    </div>
  `;
}

function findSupportMeeting(eventId) {
  return (state.supportRecords.events || []).find((event) => event.id === eventId);
}

function renderMeetingScoutModal(event = {}) {
  qs("[data-meeting-scout-title]").textContent = event.title || "Meeting notes";
  qs("[data-meeting-scout-meta]").textContent = [
    formatAlaskaTime(event.event_at),
    event.meeting_provider ? `Provider: ${event.meeting_provider}` : "",
    event.scout_is_addressed ? "Scout is listening for follow-up" : "",
    event.scout_last_summary_at ? `Updated ${formatDateTime(event.scout_last_summary_at)}` : "",
  ].filter(Boolean).join(" | ");
  const liveResponse = event.scout_latest_response
    ? `${event.scout_response_delivery === "chat" ? "Meeting chat" : "Voice"}: ${event.scout_latest_response}`
    : "Say \"listen up, Scout\" in the transcript stream to prepare a live response. Say \"that's enough, Scout\" to stop.";
  qs("[data-meeting-scout-live-response]").innerHTML = escapeMultiline(liveResponse);
  qs("[data-meeting-scout-notes]").innerHTML = escapeMultiline(event.scout_meeting_notes || "Scout is waiting for live transcript updates.");
  qs("[data-meeting-scout-takeaways]").innerHTML = escapeMultiline(event.scout_key_takeaways || "No key takeaways yet.");
  qs("[data-meeting-scout-deliverables]").innerHTML = escapeMultiline(event.scout_draft_deliverables || "Draft deliverables will appear here as the meeting develops.");
  const responseLog = qs("[data-meeting-scout-response-log]");
  const responses = Array.isArray(event.scout_live_responses) ? event.scout_live_responses : [];
  if (responseLog) {
    responseLog.innerHTML = responses.length
      ? responses.slice(-8).reverse().map((response) => `
        <article class="meeting-response-item ${response.status === "stopped" ? "stopped" : ""}">
          <span>${escapeHtml(response.delivery === "chat" ? "Meeting chat" : "Voice")} | requested by ${escapeHtml(response.requestedBy || "Speaker")} ${response.at ? `| ${escapeHtml(formatDateTime(response.at))}` : ""}</span>
          <p>${escapeMultiline(response.text || "")}</p>
        </article>
      `).join("")
      : `<p class="empty">No live Scout responses yet.</p>`;
  }
  const form = qs("[data-meeting-transcript-form]");
  if (form) {
    form.eventId.value = event.id || "";
    form.speaker.value = state.user?.display_name?.split(" ")[0] || "";
    form.text.value = "";
  }
}

function openMeetingScout(eventId) {
  const event = findSupportMeeting(eventId);
  if (!event) return;
  state.currentMeetingScoutId = eventId;
  renderMeetingScoutModal(event);
  qs("[data-meeting-scout-modal]").hidden = false;
}

function closeMeetingScout() {
  state.currentMeetingScoutId = "";
  qs("[data-meeting-scout-modal]").hidden = true;
}

async function refreshMeetingScout(action = "regenerate_summary", extra = {}) {
  const eventId = state.currentMeetingScoutId || extra.eventId;
  const event = findSupportMeeting(eventId);
  if (!event) return;
  const data = await api("/api/portal/meeting-scout", {
    method: "POST",
    body: JSON.stringify({
      action,
      eventId,
      clientId: activeClientId(),
      ...extra,
    }),
  });
  const updated = data.event;
  if (updated) {
    const index = state.supportRecords.events.findIndex((item) => item.id === updated.id);
    if (index !== -1) state.supportRecords.events[index] = updated;
    renderMeetingScoutModal(updated);
    renderSupportTimeline();
    renderExecutiveDashboard();
  }
}

async function handleMeetingTranscript(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  if (!String(payload.text || "").trim()) {
    setStatus("Add a transcript update first.", true);
    return;
  }
  try {
    await refreshMeetingScout("append_transcript", payload);
    setStatus("");
    showToast("Scout updated the meeting notes.");
  } catch (error) {
    setStatus(error.message || "Could not update meeting notes.", true);
  }
}

function renderSupportTimeline() {
  const upcoming = qs("[data-upcoming-meetings]");
  const timeline = qs("[data-support-timeline]");
  const events = state.supportRecords.events || [];
  const now = Date.now();
  const upcomingEvents = events
    .filter((event) => new Date(event.event_at).getTime() >= now)
    .sort((a, b) => new Date(a.event_at) - new Date(b.event_at));

  if (upcoming) {
    upcoming.innerHTML = upcomingEvents.length
      ? upcomingEvents.map((event) => `
        <article class="timeline-card">
          <strong>${escapeHtml(event.title || "Meeting")}</strong>
          <span>${escapeHtml(formatAlaskaTime(event.event_at))}</span>
          <p>${escapeHtml(event.notes || "No notes added.")}</p>
          ${event.meeting_join_instructions ? `<p>${escapeHtml(event.meeting_join_instructions)}</p>` : ""}
          ${meetingActions(event)}
        </article>
      `).join("")
      : `<p class="empty">No upcoming meetings yet.</p>`;
  }

  const taskItems = (state.supportRecords.tasks || [])
    .filter((task) => task.due_date)
    .map((task) => timelineItem(task.due_date, taskTypeLabel(task.task_type), task.title, `Delivery target: ${task.description || ""}`, task));
  const meetingItems = events.map((event) => timelineItem(event.event_at, "Meeting", event.title || "Meeting", event.notes || "", null, event));
  const projectItems = (state.supportRecords.projects || [])
    .filter((project) => project.target_date)
    .map((project) => timelineItem(project.target_date, "Project completion", project.name, project.scope || project.goals || ""));
  const milestoneItems = (state.supportRecords.milestones || [])
    .filter((milestone) => milestone.due_date)
    .map((milestone) => timelineItem(milestone.due_date, "Milestone", milestone.name, milestone.notes || milestone.status || ""));

  const items = [...meetingItems, ...taskItems, ...milestoneItems, ...projectItems]
    .filter((item) => item.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (timeline) {
    const groups = items.reduce((acc, item) => {
      const key = timelineDateKey(item.date);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
    timeline.innerHTML = items.length
      ? Object.entries(groups).map(([key, group]) => `
        <section class="timeline-group">
          <h3>${escapeHtml(formatTimelineDate(key))}</h3>
          ${group.map((item) => `
            <article class="timeline-card">
              <span>${escapeHtml(item.label)} | ${escapeHtml(formatTimelineDate(item.date))}</span>
              <strong>${escapeHtml(item.title || "Timeline item")}</strong>
              <p>${escapeHtml(summarizeText(item.body, 220))}</p>
              ${item.label === "Meeting" ? meetingActions(events.find((event) => event.id === item.eventId) || item.event || {}) : ""}
              ${item.task ? taskFormIsComplete(item.task) && taskHasCustomerForm(item.task) ? `<span class="task-complete-note">Form submitted</span>` : formTaskButton(item.task) : ""}
              ${item.task ? taskUploadsComplete(item.task) ? `<span class="task-complete-note">Documents uploaded</span>` : uploadTaskButton(item.task) : ""}
            </article>
          `).join("")}
        </section>
      `).join("")
      : emptyState("No scheduled work or meetings yet.", "Delivery dates, meetings, project completion dates, and milestones will appear here.");
  }
}

async function loadSupportTimeline() {
  const clientId = activeClientId();
  if (!clientId) return;
  const [calendarData, taskData, projectData, milestoneData] = await Promise.all([
    api(`/api/portal/calendar?clientId=${encodeURIComponent(clientId)}`).catch((error) => {
      console.warn(error);
      return { events: [], busySlots: [] };
    }),
    api(`/api/portal/records/tasks?clientId=${encodeURIComponent(clientId)}`).catch(() => ({ rows: [] })),
    api(`/api/portal/records/projects?clientId=${encodeURIComponent(clientId)}`).catch(() => ({ rows: [] })),
    api(`/api/portal/records/milestones?clientId=${encodeURIComponent(clientId)}`).catch(() => ({ rows: [] })),
  ]);
  state.supportRecords.events = calendarData.events || [];
  state.supportRecords.busySlots = calendarData.busySlots || [];
  state.supportRecords.tasks = taskData.rows || [];
  state.supportRecords.projects = projectData.rows || [];
  state.supportRecords.milestones = milestoneData.rows || [];
  setDefaultMeetingDate();
  renderMeetingProjects();
  renderMeetingSlots();
  renderSupportTimeline();
  renderExecutiveDashboard();
}

async function moveTask(taskId, status) {
  const task = state.workRecords.tasks.find((item) => item.id === taskId);
  if (!task || !canMoveTask(task)) {
    setStatus("Only admins or the assigned user can move that task.", true);
    return;
  }

  await api("/api/portal/records/tasks", {
    method: "PATCH",
    body: JSON.stringify({
      id: taskId,
      client_id: activeClientId(),
      status: normalizeTaskStatus(status),
    }),
  });
  setStatus("");
  showToast(`Task moved to ${workStatuses.find((item) => item.value === normalizeTaskStatus(status))?.label || "the new column"}.`);
  await loadWorkBoard();
  await loadDashboard();
}

function renderTaskFormOptions() {
  const projectSelect = qs("[data-task-project-select]");
  const storySelect = qs("[data-task-story-select]");
  const userSelect = qs("[data-task-user-select]");
  if (projectSelect) {
    projectSelect.innerHTML = [
      `<option value="">No project</option>`,
      ...state.workRecords.projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`),
    ].join("");
    projectSelect.value = state.workProjectId || "";
  }
  if (storySelect) {
    const stories = selectedWorkStories();
    storySelect.innerHTML = [
      `<option value="">No user story</option>`,
      ...stories.map((story) => `<option value="${story.id}">${escapeHtml(story.title)}</option>`),
    ].join("");
  }
  if (userSelect) {
    userSelect.innerHTML = [
      `<option value="">Unassigned</option>`,
      ...state.workRecords.users.map((user) => `<option value="${user.id}">${escapeHtml(user.display_name || user.email)}</option>`),
    ].join("");
  }
  const typeSelect = qs(`[data-task-form] select[name="task_type"]`);
  if (typeSelect) {
    typeSelect.innerHTML = supportTaskTypeOptions
      .map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`)
      .join("");
  }
}

function openTaskModal() {
  if (!state.isAdmin) return;
  renderTaskFormOptions();
  const modal = qs("[data-task-modal]");
  if (!modal) return;
  modal.hidden = false;
  qs(`[data-task-form] input[name="title"]`)?.focus();
}

function closeTaskModal() {
  const form = qs("[data-task-form]");
  const modal = qs("[data-task-modal]");
  if (form) form.reset();
  if (modal) modal.hidden = true;
}

async function handleTaskCreate(event) {
  event.preventDefault();
  if (!state.isAdmin) return;
  const form = event.currentTarget;
  const payload = compactPayload(Object.fromEntries(new FormData(form).entries()), [
    "project_id",
    "user_story_id",
    "assigned_to",
    "due_date",
    "expected_hours",
    "form_schema",
    "upload_items",
  ]);
  const formSchemaText = String(new FormData(form).get("form_schema") || "").trim();
  if (formSchemaText) {
    try {
      payload.form_schema = JSON.parse(formSchemaText);
    } catch {
      setStatus("Customer form JSON is not valid.", true);
      return;
    }
  }
  const uploadItemsText = String(new FormData(form).get("upload_items") || "").trim();
  if (uploadItemsText) {
    try {
      payload.upload_items = JSON.parse(uploadItemsText);
    } catch {
      setStatus("Upload requests JSON is not valid.", true);
      return;
    }
  }
  payload.client_id = activeClientId();
  payload.status = "todo";
  await api("/api/portal/records/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  closeTaskModal();
  showToast("Task created.");
  await loadWorkBoard();
  await loadDashboard();
}

async function handleMeetingCreate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = compactPayload(Object.fromEntries(new FormData(form).entries()), ["project_id", "notes"]);
  payload.clientId = activeClientId();
  payload.eventAt = payload.event_at;
  payload.durationMinutes = 60;
  delete payload.event_at;
  if (!payload.eventAt) {
    setStatus("Pick an available meeting time first.", true);
    return;
  }
  try {
    await api("/api/portal/calendar", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    form.reset();
    setStatus("");
    showToast("Meeting scheduled.");
    await loadSupportTimeline();
    await loadDashboard();
  } catch (error) {
    setStatus(error.message || "Could not schedule that meeting.", true);
  }
}

async function handleRecordSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const section = form.dataset.recordForm;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.client_id = activeClientId();
  if (payload.tags) payload.tags = String(payload.tags).split(",").map((tag) => tag.trim()).filter(Boolean);
  await api(`/api/portal/records/${section}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  form.reset();
  showToast(`${sectionConfig[section]?.label || "Record"} added.`);
  await loadRecords(section);
  await loadDashboard();
}

function renderExecutiveDashboard() {
  const summary = qs("[data-executive-summary]");
  const nextSteps = qs("[data-next-steps]");
  const d = state.dashboard;
  if (!d || !summary) return;

  const openTasks = (d.tasks || []).filter((task) => normalizeTaskStatus(task.status) !== "complete");
  const nextTask = [...openTasks].sort((a, b) => new Date(a.due_date || "9999-12-31") - new Date(b.due_date || "9999-12-31"))[0];
  const nextMeeting = [...(state.supportRecords.events || [])]
    .filter((event) => new Date(event.event_at).getTime() >= Date.now())
    .sort((a, b) => new Date(a.event_at) - new Date(b.event_at))[0];
  const activeProject = (d.projects || [])[0];
  const recentDoc = [...(d.documents || [])].sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0];

  summary.innerHTML = [
    {
      label: "Focus",
      title: nextTask?.title || activeProject?.name || "Workspace setup",
      body: nextTask?.description || activeProject?.scope || "No active task has been added yet.",
      meta: nextTask?.due_date ? `Due ${formatDate(nextTask.due_date)}` : activeProject?.target_date ? `Target ${formatDate(activeProject.target_date)}` : "Ready for next step",
    },
    {
      label: "Next meeting",
      title: nextMeeting?.title || "No meeting scheduled",
      body: nextMeeting?.notes || "Schedule a meeting from Support when you are ready to review progress.",
      meta: nextMeeting?.event_at ? formatAlaskaTime(nextMeeting.event_at) : "Monday-Friday, 2-9 PM Alaska time",
    },
    {
      label: "Latest file",
      title: recentDoc?.title || recentDoc?.file_name || "No documents yet",
      body: recentDoc?.description || "Uploaded files and folders will appear in Documents.",
      meta: recentDoc?.created_at ? formatDate(recentDoc.created_at) : "Document library",
    },
  ].map((item) => `
    <article class="executive-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(summarizeText(item.body, 140))}</p>
      <small>${escapeHtml(item.meta)}</small>
    </article>
  `).join("");

  if (!nextSteps) return;
  const steps = [
    nextTask ? { title: nextTask.title, body: nextTask.description || "Review the task details in Work.", nav: "work", task: nextTask } : null,
    !nextMeeting ? { title: "Schedule a project meeting", body: "Pick a time in Support so the next review is on the calendar.", nav: "support" } : null,
    !(d.documents || []).length ? { title: "Upload supporting documents", body: "Add files or folders that Scout and the project team should reference.", nav: "documents" } : null,
    !(d.projects || []).length ? { title: "Create a project with Scout", body: "Use the project setup chat to turn a new idea into a workspace.", nav: "projects" } : null,
  ].filter(Boolean).slice(0, 3);

  nextSteps.innerHTML = steps.length
    ? steps.map((step) => `
      <article class="next-step">
        <div>
          <strong>${escapeHtml(step.title)}</strong>
          <p>${escapeHtml(summarizeText(step.body, 150))}</p>
        </div>
        ${step.task && taskHasUploads(step.task) && !taskUploadsComplete(step.task)
          ? uploadTaskButton(step.task)
          : step.task && taskHasCustomerForm(step.task) && !taskFormIsComplete(step.task)
          ? formTaskButton(step.task)
          : `<button class="link-button" type="button" data-next-step-nav="${step.nav}">Open</button>`}
      </article>
    `).join("")
    : `<p class="empty">Everything currently visible is in motion. New next steps will appear as Scout and the team add work.</p>`;

  qsa("[data-next-step-nav]", nextSteps).forEach((button) => {
    button.addEventListener("click", () => showSection(button.dataset.nextStepNav || "dashboard"));
  });
}

async function loadDashboard() {
  if (!activeClientId()) return;
  state.dashboard = await api(`/api/portal/dashboard?clientId=${encodeURIComponent(activeClientId())}`);
  const d = state.dashboard;
  qs("[data-active-role]").textContent = d.client?.name || "Client workspace";
  qs("[data-metrics]").innerHTML = [
    metric("Projects", d.projects.length),
    metric("Documents", d.documents.length),
    metric("Open tasks", d.tasks.filter((task) => normalizeTaskStatus(task.status) !== "complete").length),
    metric("Support tickets", d.tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length),
    metric("Goals", d.goals.length),
    metric("Metrics", d.metrics.length),
  ].join("");
  qs("[data-timeline]").innerHTML = d.timeline.length
    ? d.timeline.map((item) => `<article><strong>${escapeHtml(item.title)}</strong><span>${formatDate(item.created_at)}</span><p>${escapeHtml(summarizeText(item.description))}</p>${sourcePill(item)}</article>`).join("")
    : emptyState("No activity yet.", "Recent document, task, project, and Scout activity will show here.");
  const taskSummary = qs("[data-task-summary]");
  taskSummary.innerHTML = d.tasks.length
    ? d.tasks.slice(0, 8).map((task) => `<article class="record-row"><strong>${task.title}</strong><span>${task.status || "todo"} ${task.due_date ? `• due ${formatDate(task.due_date)}` : ""}</span><p>${summarizeText(task.description)}</p></article>`).join("")
    : emptyState("No tasks yet.", "Tasks created by Scout or an admin will appear here and on the Work board.");
  taskSummary.innerHTML = d.tasks.length
    ? d.tasks.slice(0, 8).map((task) => `<article class="record-row"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.status || "todo")} ${task.due_date ? `| due ${formatDate(task.due_date)}` : ""}</span><p>${escapeHtml(summarizeText(task.description))}</p>${taskFormIsComplete(task) && taskHasCustomerForm(task) ? `<span class="task-complete-note">Form submitted</span>` : formTaskButton(task)}${taskUploadsComplete(task) ? `<span class="task-complete-note">Documents uploaded</span>` : uploadTaskButton(task)}</article>`).join("")
    : emptyState("No tasks yet.", "Tasks created by Scout or an admin will appear here and on the Work board.");
  renderSetupTour();
  renderExecutiveDashboard();
}

async function loadAdmin() {
  if (!state.isAdmin) return;
  const admin = await api("/api/portal/admin");
  qs("[data-admin-metrics]").innerHTML = [
    metric("Clients", admin.counts.clients),
    metric("Active projects", admin.counts.activeProjects),
    metric("Overdue tasks", admin.counts.overdueTasks),
    metric("Open tickets", admin.counts.openTickets),
    metric("Leads", admin.counts.leads),
    metric("Outstanding invoices", admin.counts.outstandingInvoices),
  ].join("");
  qs("[data-admin-clients]").innerHTML = admin.clients.map((client) => `
    <button class="client-row" data-pick-client="${client.id}">
      <strong>${client.name}</strong>
      <span>${client.status || "active"} • ${client.admin_status || "client"}</span>
    </button>
  `).join("");
  qsa("[data-pick-client]").forEach((button) => {
    button.addEventListener("click", async () => {
      qs("[data-client-picker]").value = button.dataset.pickClient;
      await reloadWorkspace();
    });
  });
}

async function loadClients() {
  if (!state.isAdmin) return;
  const data = await api("/api/portal/clients");
  state.clients = data.clients;
  const picker = qs("[data-client-picker]");
  picker.hidden = false;
  picker.innerHTML = state.clients.map((client) => `<option value="${client.id}">${client.name}</option>`).join("");
  if (!state.clientId && state.clients[0]) state.clientId = state.clients[0].id;
  picker.value = state.clientId;
}

async function reloadWorkspace() {
  setStatus("Loading workspace...");
  const sections = Object.keys(sectionConfig).filter((section) =>
    !knowledgeSections.includes(section) &&
    !["support_tickets", "training_materials", "handover_items", "calendar_events"].includes(section)
  );
  try {
    await loadDashboard();
    await Promise.all(sections.map((section) => loadRecords(section).catch(() => null)));
    await loadKnowledgeLibrary().catch(() => null);
    await loadSupportTimeline().catch(() => null);
    await loadAdmin();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Could not load workspace.", true);
  }
}

async function initializeLoginPage() {
  const params = new URLSearchParams(location.search);
  const inviteToken = params.get("invite");
  const resetToken = params.get("reset");
  const magicToken = params.get("magic");
  const linkEmail = params.get("email") || "";

  if (inviteToken) {
    const form = qs("[data-invite-accept-form]");
    form.token.value = inviteToken;
    qs("[data-invite-token-visible]").value = inviteToken;
    form.email.value = linkEmail;
    showAuthMode("invite");
  } else if (resetToken) {
    const form = qs("[data-reset-password-form]");
    form.token.value = resetToken;
    form.email.value = linkEmail;
    showAuthMode("reset");
  } else if (magicToken) {
    showAuthMode("login");
    try {
      await api("/api/portal/complete-magic-link", {
        method: "POST",
        body: JSON.stringify({ token: magicToken, email: linkEmail }),
      });
      history.replaceState({}, "", "/portal");
    } catch (error) {
      qs("[data-login-status]").textContent = error.message;
    }
  } else {
    showAuthMode("login");
  }

  try {
    await api("/api/portal/me");
    location.href = "/portal/dashboard";
  } catch {
    // Stay on the login page.
  }
}

async function initializeDashboardPage() {
  try {
    const data = await api("/api/portal/me");
    state.user = data.user;
    state.isAdmin = data.isAdmin;
    state.clientId = data.clientId || "";

    qs("[data-user-name]").textContent = state.user.display_name;
    qsa("[data-admin-only]").forEach((el) => {
      el.hidden = !state.isAdmin;
    });

    Object.keys(sectionConfig).forEach(renderRecordPanel);
    if (state.isAdmin) await loadClients();
    await reloadWorkspace();
  } catch (error) {
    if (error.status === 401) {
      location.href = "/portal";
      return;
    }
    setStatus(error.message || "Could not load the portal dashboard.", true);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const status = qs("[data-login-status]");
  status.textContent = "Signing in...";
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    await api("/api/portal/login", { method: "POST", body: JSON.stringify(payload) });
    status.textContent = "";
    location.href = "/portal/dashboard";
  } catch (error) {
    status.textContent = error.message;
  }
}

async function handleInviteAccept(event) {
  event.preventDefault();
  const status = qs("[data-invite-status]");
  status.textContent = "Creating account...";
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    payload.token = payload.token || payload.tokenVisible;
    delete payload.tokenVisible;
    await api("/api/portal/accept-invite", { method: "POST", body: JSON.stringify(payload) });
    status.textContent = "";
    location.href = "/portal/dashboard";
  } catch (error) {
    status.textContent = error.message;
  }
}

async function handleAccessLink(event) {
  event.preventDefault();
  const status = qs("[data-access-link-status]");
  const output = qs("[data-access-link-output]");
  status.textContent = "Creating help link...";
  output.value = "";
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const data = await api("/api/portal/request-access-link", { method: "POST", body: JSON.stringify(payload) });
    status.textContent = data.message || "Help link created.";
    output.value = data.accessUrl || "";
  } catch (error) {
    status.textContent = error.message;
  }
}

async function handlePasswordReset(event) {
  event.preventDefault();
  const status = qs("[data-reset-password-status]");
  status.textContent = "Resetting password...";
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    await api("/api/portal/complete-password-reset", { method: "POST", body: JSON.stringify(payload) });
    status.textContent = "Password reset. You can log in now.";
    history.replaceState({}, "", "/portal");
    showAuthMode("login");
  } catch (error) {
    status.textContent = error.message;
  }
}

async function handleUpload(event) {
  event.preventDefault();
  const fileInput = event.currentTarget.querySelector(`input[type="file"]`);
  await uploadDocumentFiles(Array.from(fileInput?.files || []));
}

async function handleFolderCreate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.clientId = activeClientId();
  payload.parentFolderId = state.documentFolderId;
  await api("/api/portal/document-folders", { method: "POST", body: JSON.stringify(payload) });
  form.reset();
  showToast("Folder created.");
  await loadDocumentLibrary();
}

async function handleAi(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  payload.clientId = activeClientId();
  payload.save = payload.save === "on";
  qs("[data-ai-output]").textContent = "Thinking...";
  try {
    const data = await api("/api/portal/ai", { method: "POST", body: JSON.stringify(payload) });
    qs("[data-ai-output]").textContent = data.text;
  } catch (error) {
    qs("[data-ai-output]").textContent = error.message;
  }
}

async function handleClientCreate(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const data = await api("/api/portal/clients", { method: "POST", body: JSON.stringify(payload) });
  state.clientId = data.client.id;
  event.currentTarget.reset();
  showToast("Client created.");
  await loadClients();
  await reloadWorkspace();
}

async function handleUserInvite(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  payload.clientId = activeClientId();
  const data = await api("/api/portal/users", { method: "POST", body: JSON.stringify(payload) });
  qs("[data-invite-output]").value = data.inviteUrl;
  event.currentTarget.reset();
  showToast("Invite created.");
}

async function handleSearch(event) {
  const q = event.currentTarget.value.trim();
  if (q.length < 2 || !activeClientId()) return;
  const data = await api(`/api/portal/search?clientId=${encodeURIComponent(activeClientId())}&q=${encodeURIComponent(q)}`);
  setStatus(data.results.slice(0, 5).map((r) => `${r.label}: ${r.title}`).join(" | ") || "No matches.");
}

qsa("[data-nav]").forEach((button) => {
  button.addEventListener("click", () => showSection(button.dataset.nav));
});

qs("[data-login-form]")?.addEventListener("submit", handleLogin);
qs("[data-invite-accept-form]")?.addEventListener("submit", handleInviteAccept);
qs("[data-access-link-form]")?.addEventListener("submit", handleAccessLink);
qs("[data-reset-password-form]")?.addEventListener("submit", handlePasswordReset);
qs("[data-upload-form]")?.addEventListener("submit", handleUpload);
qs("[data-project-picker]")?.addEventListener("change", (event) => {
  if (event.currentTarget.value === "__create__") {
    event.currentTarget.value = state.selectedProjectId || "";
    openProjectScout();
    return;
  }
  state.selectedProjectId = event.currentTarget.value;
  renderProjectWorkspace();
});
qs("[data-project-scout-open]")?.addEventListener("click", openProjectScout);
qs("[data-project-scout-close]")?.addEventListener("click", () => {
  qs("[data-project-scout]").hidden = true;
});
qs("[data-project-scout-form]")?.addEventListener("submit", handleProjectScoutSubmit);
qs("[data-project-scout-create]")?.addEventListener("click", handleProjectScoutCreate);
qsa("[data-work-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    qsa("[data-work-tab]").forEach((tab) => {
      const active = tab.dataset.workTab === button.dataset.workTab;
      tab.classList.toggle("active", active);
      tab.classList.toggle("secondary", !active);
    });
    qsa("[data-work-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.workPanel === button.dataset.workTab);
    });
  });
});
qs("[data-work-project-filter]")?.addEventListener("change", (event) => {
  state.workProjectId = event.currentTarget.value;
  renderWorkWorkspace();
});
qs("[data-task-create-open]")?.addEventListener("click", openTaskModal);
qs("[data-task-close]")?.addEventListener("click", closeTaskModal);
qs("[data-task-cancel]")?.addEventListener("click", closeTaskModal);
qs("[data-task-form]")?.addEventListener("submit", handleTaskCreate);
qs("[data-task-detail-close]")?.addEventListener("click", closeTaskDetail);
qs("[data-task-form-close]")?.addEventListener("click", closeTaskForm);
qs("[data-task-form-cancel]")?.addEventListener("click", closeTaskForm);
qs("[data-task-answer-form]")?.addEventListener("submit", handleTaskFormSubmit);
qs("[data-task-upload-close]")?.addEventListener("click", closeTaskUpload);
qs("[data-meeting-scout-close]")?.addEventListener("click", closeMeetingScout);
qs("[data-meeting-transcript-form]")?.addEventListener("submit", handleMeetingTranscript);
qs("[data-meeting-scout-refresh]")?.addEventListener("click", () => {
  refreshMeetingScout().catch((error) => setStatus(error.message || "Could not refresh meeting notes.", true));
});
qs("[data-task-detail-modal]")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeTaskDetail();
});
qs("[data-task-form-modal]")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeTaskForm();
});
qs("[data-task-upload-modal]")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeTaskUpload();
});
qs("[data-meeting-scout-modal]")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeMeetingScout();
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-task-form-open]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  openTaskForm(button.dataset.taskFormOpen || "");
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-task-upload-open]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  openTaskUpload(button.dataset.taskUploadOpen || "");
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-meeting-scout-open]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  openMeetingScout(button.dataset.meetingScoutOpen || "");
});
qs("[data-project-detail-close]")?.addEventListener("click", closeProjectDetail);
qs("[data-project-detail-modal]")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeProjectDetail();
});
qs("[data-meeting-form]")?.addEventListener("submit", handleMeetingCreate);
qs("[data-meeting-date]")?.addEventListener("change", renderMeetingSlots);
qs("[data-task-project-select]")?.addEventListener("change", () => {
  const projectId = qs("[data-task-project-select]")?.value || "";
  const stories = state.workRecords.requirements.filter((story) => !projectId || story.project_id === projectId);
  const storySelect = qs("[data-task-story-select]");
  if (storySelect) {
    storySelect.innerHTML = [
      `<option value="">No user story</option>`,
      ...stories.map((story) => `<option value="${story.id}">${escapeHtml(story.title)}</option>`),
    ].join("");
  }
});
qs("[data-knowledge-add]")?.addEventListener("click", openKnowledgeModal);
qs("[data-knowledge-close]")?.addEventListener("click", closeKnowledgeModal);
qs("[data-knowledge-cancel]")?.addEventListener("click", closeKnowledgeModal);
qs("[data-knowledge-type]")?.addEventListener("change", renderKnowledgeFields);
qs("[data-knowledge-form]")?.addEventListener("submit", handleKnowledgeSubmit);
qs("[data-knowledge-detail-close]")?.addEventListener("click", closeKnowledgeDetail);
qs("[data-knowledge-detail-modal]")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeKnowledgeDetail();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeKnowledgeDetail();
    closeTaskDetail();
    closeTaskForm();
    closeTaskUpload();
    closeMeetingScout();
    closeProjectDetail();
    closeWalkthrough();
  }
});
window.addEventListener("resize", positionWalkthrough);
window.addEventListener("scroll", positionWalkthrough, true);
qs("[data-folder-form]")?.addEventListener("submit", handleFolderCreate);
qs("[data-folder-toggle]")?.addEventListener("click", () => {
  const form = qs("[data-folder-form]");
  if (!form) return;
  form.hidden = !form.hidden;
  if (!form.hidden) qs(`input[name="name"]`, form)?.focus();
});
qs("[data-document-upload-trigger]")?.addEventListener("click", () => {
  qs(`[data-upload-form] input[type="file"]`)?.click();
});
qs(`[data-upload-form] input[type="file"]`)?.addEventListener("change", (event) => {
  uploadDocumentFiles(Array.from(event.currentTarget.files || [])).catch((error) => setStatus(error.message, true));
});
qs("[data-document-dropzone]")?.addEventListener("dragover", (event) => {
  event.preventDefault();
  qs("[data-document-dropzone]")?.classList.add("drag-over");
});
qs("[data-document-dropzone]")?.addEventListener("dragleave", () => {
  qs("[data-document-dropzone]")?.classList.remove("drag-over");
});
qs("[data-document-dropzone]")?.addEventListener("drop", (event) => {
  const dropzone = qs("[data-document-dropzone]");
  dropzone?.classList.remove("drag-over");
  if (event.dataTransfer?.files?.length) {
    event.preventDefault();
    uploadDocumentFiles(Array.from(event.dataTransfer.files)).catch((error) => setStatus(error.message, true));
  }
});
qs("[data-ai-form]")?.addEventListener("submit", handleAi);
qs("[data-client-form]")?.addEventListener("submit", handleClientCreate);
qs("[data-user-form]")?.addEventListener("submit", handleUserInvite);
qs("[data-global-search]")?.addEventListener("input", handleSearch);
qs("[data-client-picker]")?.addEventListener("change", reloadWorkspace);
qs("[data-mobile-nav-toggle]")?.addEventListener("click", () => {
  qs(".portal-sidebar")?.classList.toggle("open");
});
qs("[data-logout]")?.addEventListener("click", async () => {
  await api("/api/portal/logout", { method: "POST", body: JSON.stringify({}) });
  location.href = "/portal";
});
qsa("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => showAuthMode(button.dataset.authMode));
});

if (portalMode === "dashboard") {
  initializeDashboardPage();
} else {
  initializeLoginPage();
}
