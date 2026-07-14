import OpenAI from "openai";
import { createToken, hashToken } from "./auth";
import { getEnv } from "./env";
import { buildPortalUrl, secretLinkPayload, sendPortalLinkEmail, shouldReturnSecretLinks } from "./secret-links";
import { insertRow, selectOne, selectRows, updateRows, eq } from "./supabase";

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

type LeadPayload = {
  id?: string;
  name?: string | null;
  email: string;
  company?: string | null;
  phone?: string | null;
  workflow_type?: string | null;
  workflow_summary?: string | null;
  diagnostic_summary?: Record<string, unknown> | null;
  transcript?: ClientMessage[];
};

type ProvisionPlan = {
  clientProfile?: {
    name?: string;
    industry?: string;
    communicationStyle?: string;
    technicalComfort?: string;
    budgetNotes?: string;
  };
  contact?: {
    name?: string;
    title?: string;
    responsibilities?: string;
    notes?: string;
  };
  businessKnowledge?: Array<{ title: string; category?: string; content: string; tags?: string[] }>;
  workflows?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
  milestones?: Array<Record<string, unknown>>;
  estimates?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
  initialMeetings?: Array<Record<string, unknown>>;
  tasks?: Array<Record<string, unknown>>;
  dataRequests?: Array<Record<string, unknown>>;
  systemAccess?: Array<Record<string, unknown>>;
  requirements?: Array<Record<string, unknown>>;
  goals?: Array<Record<string, unknown>>;
  metrics?: Array<Record<string, unknown>>;
  risks?: Array<Record<string, unknown>>;
  openQuestions?: Array<Record<string, unknown>>;
  tourSteps?: Array<{ title: string; body: string; portalSection: string }>;
};

function clean(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function transcriptText(messages: ClientMessage[] = []) {
  return messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n").slice(0, 24000);
}

function isoDatePlus(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextBusinessDate(daysFromNow: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  for (let index = 0; index < 10; index += 1) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) return date.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

function nextInitialMeetingIso(): string {
  const date = nextBusinessDate(3);
  return `${date}T22:00:00.000Z`; // 2 PM Alaska during daylight time; acceptable default for pre-meeting placeholder.
}

function compactWorkflowText(lead: LeadPayload): string {
  return clean(lead.workflow_summary) || transcriptText(lead.transcript || []).slice(0, 1800);
}

function defaultWorkflowName(lead: LeadPayload): string {
  const text = compactWorkflowText(lead).toLowerCase();
  if (text.includes("insurance") || text.includes("dentrix") || text.includes("dental")) return "Dental front-office intake and follow-up";
  if (text.includes("email") || text.includes("inbox")) return "Email intake";
  if (text.includes("route") || text.includes("dispatch")) return "Dispatch and route coordination";
  return lead.workflow_type || "Workflow from Scout inquiry";
}

function fallbackCurrentProcess(lead: LeadPayload): string {
  const text = compactWorkflowText(lead);
  if (/dentrix|dental|insurance|payer/i.test(text)) {
    return [
      "Northstar Family Dental operates three locations with front desk and billing staff coordinating patient scheduling, insurance verification, payer portal checks, treatment-plan follow-up, no-show recovery, and claim attachment preparation.",
      "The current process depends on Dentrix for scheduling and records, Outlook shared inboxes for incoming requests and follow-up, payer portals for eligibility and claim status, phone calls for patient coordination, spreadsheets for unscheduled treatment and call lists, and PDF scans for attachments.",
      "Staff manually decide what to verify, what to send, what needs patient outreach, and what requires billing review. Outbound patient messages and anything with clinical or financial impact must stay human-approved.",
    ].join("\n\n");
  }

  return [
    "Scout captured an operational workflow that is currently handled through a mix of existing business systems, staff judgment, manual handoffs, and repeated follow-up.",
    text,
    "The first project should map inputs, outputs, decision points, review points, and exceptions before automation is introduced.",
  ].filter(Boolean).join("\n\n");
}

function fallbackPainPoints(lead: LeadPayload): string {
  const text = compactWorkflowText(lead);
  if (/dentrix|dental|insurance|payer/i.test(text)) {
    return [
      "Insurance verification, treatment-plan follow-up, no-show recovery, and claim attachment preparation are competing for the same front-office and billing attention, which makes the work easy to delay or drop during busy clinic days.",
      "Payer portals and inboxes are inconsistent, so staff lose time checking status, copying information between systems, and deciding what needs follow-up. The practice is also training new front desk employees, increasing the risk of uneven handoffs.",
      "The business impact is delayed verification, missed follow-up opportunities, avoidable rework, slower claims, and patient communication that depends too heavily on individual staff memory. HIPAA and patient trust require careful human approval for outbound messages and sensitive decisions.",
    ].join("\n\n");
  }

  return [
    "The workflow creates avoidable manual effort, inconsistent follow-up, and dependence on individual staff memory.",
    "The main risk is not just time loss; it is dropped handoffs, delayed decisions, and lack of visibility into what should happen next.",
    text,
  ].filter(Boolean).join("\n\n");
}

function safeJson(text: string): ProvisionPlan | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function fallbackPlan(lead: LeadPayload): ProvisionPlan {
  const projectName = lead.workflow_type
    ? `${lead.workflow_type} pilot`
    : "First workflow pilot";
  const workflowName = defaultWorkflowName(lead);

  return {
    clientProfile: {
      name: lead.company || lead.name || lead.email,
    },
    contact: {
      name: lead.name || lead.email,
      responsibilities: "Primary contact from the initial Scout inquiry.",
    },
    businessKnowledge: [
      {
        title: "Initial Scout inquiry summary",
        category: "conversation summary",
        content: lead.workflow_summary || "Initial workflow inquiry submitted through Scout.",
        tags: ["scout", "inquiry"],
      },
    ],
    workflows: [
      {
        name: workflowName,
        agile_epic: "Front-office relief and safer follow-up",
        current_process: fallbackCurrentProcess(lead),
        pain_points: fallbackPainPoints(lead),
        tools: "Existing systems and files named in the Scout conversation.",
        inputs: "Representative inbox items, portal screenshots/exports, spreadsheet examples, PDFs, call lists, and current SOPs.",
        outputs: "Prioritized work queue, draft follow-up messages, verification checklist, exception list, and reporting summary.",
        people_involved: "Owner or manager, front desk team, billing staff, and Conneen AI reviewer.",
        frequency: "Daily operational workflow with higher pressure during busy clinic or intake days.",
        cost_of_pain: "Staff time, delayed follow-up, rework, dropped handoffs, and reduced visibility into work that needs attention.",
        automation_opportunity: "A human-approved assistant can triage incoming items, prepare verification/follow-up work queues, draft safe messages, summarize exceptions, and help staff see what needs review next.",
        workflow_type: lead.workflow_type || "custom software",
        status: "discovered",
        priority: "high",
      },
    ],
    projects: [
      {
        name: projectName,
        agile_stage: "discovery",
        status: "active",
        scope: "Initial project workspace created from Scout inquiry. Confirm scope during the first meeting.",
        goals: "Clarify the workflow, confirm inputs and constraints, and identify a practical first pilot.",
        deliverables: "Discovery notes, workflow map, data request checklist, and first pilot recommendation.",
        target_date: isoDatePlus(45),
      },
    ],
    milestones: [
      { name: "Discovery complete", stage: "discovery", status: "not started", due_date: nextBusinessDate(7), notes: "Confirm process map, human review points, systems involved, and pilot success criteria." },
      { name: "Sample data received", stage: "data readiness", status: "not started", due_date: nextBusinessDate(14), notes: "Receive representative exports, screenshots, forms, PDFs, inbox samples, and current tracking spreadsheets." },
      { name: "First workflow prototype ready", stage: "prototype", status: "not started", due_date: nextBusinessDate(28), notes: "Prepare the first human-approved workflow queue, draft-message templates, and exception summary for review." },
      { name: "Live test started", stage: "testing", status: "not started", due_date: nextBusinessDate(35), notes: "Run the pilot with staff approval and compare against baseline follow-up and verification performance." },
      { name: "Handoff complete", stage: "handoff", status: "not started", due_date: nextBusinessDate(45), notes: "Document workflow, train users, capture risks, and decide whether to expand the pilot." },
    ],
    estimates: [
      {
        title: "Initial conservative planning estimate",
        estimate_type: "planning estimate",
        hourly_rate: 150,
        hour_range_low: 20,
        hour_range_high: 40,
        assumptions: "Rough planning range for discovery, workflow mapping, first prototype, staff review loop, live-test support, and handoff. This is not an approved quote; Conneen AI must review and approve scope before commitment.",
        approval_status: "draft",
      },
    ],
    payments: [
      { title: "Discovery and workflow map checkpoint", amount: 1500, status: "planned", due_date: nextBusinessDate(7), notes: "Placeholder milestone payment tied to discovery completion; requires approval before use.", visibility: "internal" },
      { title: "Prototype/live-test checkpoint", amount: 3000, status: "planned", due_date: nextBusinessDate(28), notes: "Placeholder milestone payment tied to prototype readiness; requires approval before use.", visibility: "internal" },
    ],
    initialMeetings: [
      {
        title: "Initial Scout workspace review",
        event_at: nextInitialMeetingIso(),
        duration_minutes: 60,
        event_type: "meeting",
        location: "Online",
        notes: "Review the Scout-created workspace, confirm scope, identify missing data, and decide whether the first pilot should proceed.",
        visibility: "shared",
      },
    ],
    requirements: [
      {
        title: "As an office manager, I can see a prioritized daily verification and follow-up queue",
        requirement_type: "user story",
        priority: "must",
        status: "proposed",
        description: "The workspace should support a queue that highlights verification, treatment-plan follow-up, claim attachment, and no-show recovery items that need human review.",
        acceptance_criteria: "The queue separates item types, shows source/context, marks required human approval, and lets staff identify next action without searching multiple systems.",
      },
      {
        title: "As billing staff, I can prepare claim attachment work without hunting through scans",
        requirement_type: "user story",
        priority: "should",
        status: "proposed",
        description: "The pilot should organize document/attachment prep into a predictable checklist with exceptions surfaced for review.",
        acceptance_criteria: "Staff can see required attachments, missing items, payer-specific notes, and review status before claim submission.",
      },
      {
        title: "As the owner, I can measure whether the pilot reduces dropped follow-up",
        requirement_type: "user story",
        priority: "should",
        status: "proposed",
        description: "The pilot should track simple before/after metrics that show whether staff time and missed follow-up are improving.",
        acceptance_criteria: "Baseline and live-test metrics are captured for verification turnaround, follow-up completion, rework, and no-show recovery touches.",
      },
    ],
    tasks: [
      {
        title: "Confirm the current workflow map",
        description: "Answer Scout's workflow-confirmation questions so the project team can correct any missing systems, handoffs, exception paths, or approval points.",
        status: "todo",
        task_type: "customer_questions",
        priority: "normal",
        expected_hours: 2,
        success_metrics: "Owner or manager confirms that the process map is accurate enough for pilot scoping.",
        risks: "Missing exceptions could cause the prototype to optimize the wrong handoff.",
        form_schema: {
          title: "Confirm the current workflow map",
          intro: "Scout drafted this from your conversation. A few plain-English answers will help the team avoid building around the wrong assumptions.",
          fields: [
            { name: "missing_systems", label: "Are there any systems, inboxes, spreadsheets, portals, or paper steps Scout missed?", type: "textarea", required: true },
            { name: "most_common_exceptions", label: "What exceptions or edge cases happen most often?", type: "textarea", required: true },
            { name: "approval_points", label: "Which steps must a human approve before anything is sent, changed, or filed?", type: "textarea", required: true },
            { name: "pilot_owner", label: "Who should be the day-to-day point person for confirming pilot details?", type: "text", required: false },
          ],
        },
        userStoryTitle: "As an office manager, I can see a prioritized daily verification and follow-up queue",
      },
      {
        title: "Collect sample data and screenshots",
        description: "Upload representative Dentrix views/exports, payer portal screenshots, spreadsheet examples, PDF attachment examples, inbox samples, and current call-list formats.",
        status: "todo",
        task_type: "data_request",
        priority: "high",
        expected_hours: 3,
        success_metrics: "Conneen AI has enough sample material to design the queue and exception handling without accessing live PHI unnecessarily.",
        risks: "Insufficient samples may delay prototype design or hide compliance constraints.",
        upload_items: [
          {
            id: "dentrix_examples",
            title: "Dentrix screenshots or exports",
            description: "Upload de-identified examples of the schedule, ledger, verification, or task views that staff use for this workflow.",
            category: "sample data",
          },
          {
            id: "payer_portal_examples",
            title: "Payer portal examples",
            description: "Upload screenshots or PDFs that show common eligibility, claim status, or exception patterns. Do not upload live credentials.",
            category: "sample data",
          },
          {
            id: "current_tracking_sheet",
            title: "Current follow-up spreadsheet or call list",
            description: "Upload the spreadsheet or list staff currently use to track unscheduled treatment, no-shows, verification, or follow-up work.",
            category: "sample data",
          },
          {
            id: "sample_attachment_pdfs",
            title: "Sample claim attachment PDFs",
            description: "Upload representative attachment examples, preferably de-identified, so Scout can understand file naming and review needs.",
            category: "sample data",
          },
        ],
        userStoryTitle: "As billing staff, I can prepare claim attachment work without hunting through scans",
      },
      {
        title: "Draft human-approved message templates",
        description: "Prepare safe patient-facing follow-up templates for no-show recovery and treatment-plan nudges. Staff must approve all outbound messages.",
        status: "todo",
        task_type: "development",
        priority: "normal",
        expected_hours: 4,
        success_metrics: "Templates are reviewed for tone, scope, and HIPAA-safe content before live use.",
        risks: "Templates must not provide clinical advice or imply automated decision-making.",
        userStoryTitle: "As an office manager, I can see a prioritized daily verification and follow-up queue",
      },
      {
        title: "Define baseline and live-test metrics",
        description: "Pick the before/after measures for verification turnaround, dropped follow-up, rework, no-show recovery, and staff time.",
        status: "todo",
        task_type: "development",
        priority: "normal",
        expected_hours: 2,
        success_metrics: "Pilot scorecard is clear enough to decide whether to continue after the live test.",
        risks: "Without baseline metrics, the pilot may feel useful but be hard to justify.",
        userStoryTitle: "As the owner, I can measure whether the pilot reduces dropped follow-up",
      },
    ],
    dataRequests: [
      {
        title: "Upload representative workflow samples",
        requested_items: "Provide de-identified examples where possible: Dentrix schedule/ledger screenshots or exports, payer portal verification screens, shared inbox examples, unscheduled-treatment spreadsheet, no-show call list, claim attachment PDFs, current SOPs, and any report used to track follow-up.",
        status: "open",
      },
    ],
    systemAccess: [
      {
        system_name: "Dentrix",
        access_type: "screenshots or read-only export first",
        status: "requested",
        safe_instructions: "Start with de-identified screenshots/exports. Do not provide live credentials until scope, HIPAA handling, and access controls are approved.",
        integration_status: "not started",
        notes: "Used for scheduling/records context and possible future workflow queue inputs.",
      },
      {
        system_name: "Outlook shared inboxes",
        access_type: "sample messages/export first",
        status: "requested",
        safe_instructions: "Share representative, scrubbed examples before any mailbox integration is discussed.",
        integration_status: "not started",
        notes: "Used to understand intake and follow-up message patterns.",
      },
      {
        system_name: "Payer portals",
        access_type: "process screenshots only",
        status: "requested",
        safe_instructions: "Do not share payer portal credentials in the portal. Capture workflow screenshots and exception examples instead.",
        integration_status: "not started",
        notes: "Used to map verification and claim-status steps.",
      },
    ],
    goals: [
      {
        title: "Reduce dropped front-office follow-up",
        description: "Make verification, no-show recovery, treatment-plan follow-up, and claim attachment prep visible in one prioritized workflow so staff can act consistently.",
        status: "active",
        target_date: isoDatePlus(45),
      },
    ],
    metrics: [
      {
        name: "Verification turnaround time",
        baseline_value: "To be measured during discovery",
        target_value: "Meaningful reduction during pilot",
        measurement_method: "Compare average time from appointment/task creation to completed verification before and during live test.",
        status: "tracking",
      },
      {
        name: "Dropped follow-up items",
        baseline_value: "To be counted from existing spreadsheets/call lists",
        target_value: "Fewer unworked items after daily queue review",
        measurement_method: "Count items older than agreed SLA before and during pilot.",
        status: "tracking",
      },
      {
        name: "Staff rework or duplicate checks",
        baseline_value: "To be estimated in discovery",
        target_value: "Reduced repeated portal/inbox checks",
        measurement_method: "Track duplicate checks or re-opened items during pilot week.",
        status: "tracking",
      },
    ],
    risks: [
      {
        title: "HIPAA and patient communication boundaries",
        description: "The workflow may touch patient information and outbound messages. Any automation must avoid clinical advice and keep staff approval in control.",
        severity: "high",
        mitigation: "Use de-identified samples for discovery, document access rules, and require human approval for all outbound patient messages.",
        status: "open",
      },
      {
        title: "Payer portal inconsistency",
        description: "Different payer portals may have inconsistent screens, rules, and export options.",
        severity: "medium",
        mitigation: "Start with a narrow set of common verification/attachment patterns and capture exceptions rather than trying to automate every portal.",
        status: "open",
      },
    ],
    openQuestions: [
      {
        question: "Which one workflow should be the first live-test focus: verification, no-show recovery, treatment-plan follow-up, or claim attachment prep?",
        status: "open",
      },
      {
        question: "What patient communication language is already approved by the practice?",
        status: "open",
      },
      {
        question: "Which examples can be safely shared de-identified for discovery?",
        status: "open",
      },
    ],
    tourSteps: [
      {
        title: "Dashboard - project summary and quick actions",
        body: "Start here for Scout's summary, current pilot status, next steps, key counts, setup tour links, and recent activity.",
        portalSection: "dashboard",
      },
      {
        title: "Projects - scope, milestones, and planning records",
        body: "Review the initial project workspace, including scope, goals, deliverables, milestones, draft estimate, and payment placeholders.",
        portalSection: "projects",
      },
      {
        title: "Work - user stories and tasks",
        body: "See the starter backlog Scout created from your conversation, including user stories, work items, sample-data tasks, and review checkpoints.",
        portalSection: "work",
      },
      {
        title: "Documents - upload sample materials",
        body: "Upload de-identified examples, screenshots, exports, PDFs, policies, and other source material the team should review.",
        portalSection: "documents",
      },
      {
        title: "Knowledge - process and business context",
        body: "Read the workflow inventory, process summary, pain points, business rules, goals, decisions, and notes Scout captured.",
        portalSection: "knowledge",
      },
      {
        title: "Support - meetings and timeline",
        body: "Schedule the first review meeting and inspect the timeline for milestones, due dates, meetings, and project targets.",
        portalSection: "support",
      },
    ],
  };
}

async function buildProvisionPlan(lead: LeadPayload): Promise<ProvisionPlan> {
  const apiKey = getEnv("OPENAI_API_KEY");
  const useAiProvisioning = getEnv("PORTAL_PROVISION_WITH_AI") !== "false";
  if (!apiKey || !useAiProvisioning) return fallbackPlan(lead);

  const client = new OpenAI({ apiKey });
  const model = getEnv("OPENAI_MODEL") || "gpt-5-mini";
  const response = await client.responses.create({
    model,
    reasoning: { effort: "low" },
    instructions: `
You convert a Scout inquiry into a pre-meeting Conneen AI client portal workspace.
Return only valid JSON. Do not include markdown.

Populate fields from the conversation only. If unknown, create sensible open questions or data requests.
Create a custom tour that tells the client exactly where the project information from their conversation was stored.
Create tourSteps for every client-facing area that has useful setup content: dashboard, projects, work, documents, knowledge, and support when applicable. These steps become buttons that launch section-specific UI walkthroughs.

Critical quality rules:
- Do not copy one raw user message into current_process or pain_points.
- current_process must be a readable operational summary that preserves every important tool, handoff, input, output, actor, approval point, constraint, and exception mentioned.
- pain_points must summarize the business pain and operational risk. It should be specific, complete, and easy to scan.
- If the prospect naturally asks for a workspace, pilot outline, quote, meeting, milestones, tasks, or next steps, create those records.
- Keep estimates conservative. Any quote/estimate must be draft/planning only and state that Conneen AI review and approval are required.
- Tasks should be concrete work items, include task_type, expected_hours, success_metrics, risks, and userStoryTitle when they attach to a user story.
- When Scout needs the customer to answer questions, create a task with task_type "customer_questions" and a form_schema. The form_schema must be a JSON object with title, intro, and fields. Each field should include name, label, type ("text", "textarea", "select", "date", "number", or "email"), required, optional help, and optional options for select fields. These forms should collect the missing customer inputs needed to finish setup.
- When Scout needs documents uploaded, create a data_request task with upload_items. upload_items must be an array of objects with id, title, description, and category. Each item should describe one specific file or file type the customer should upload.
- User stories belong in requirements. Use requirement_type "user story".
- Create a first meeting/calendar event when the user asks to move forward or inspect the workspace.

JSON shape:
{
  "clientProfile":{"name":"","industry":"","communicationStyle":"","technicalComfort":"","budgetNotes":""},
  "contact":{"name":"","title":"","responsibilities":"","notes":""},
  "businessKnowledge":[{"title":"","category":"","content":"","tags":[""]}],
  "workflows":[{"name":"","agile_epic":"","current_process":"","pain_points":"","tools":"","inputs":"","outputs":"","people_involved":"","frequency":"","cost_of_pain":"","automation_opportunity":"","workflow_type":"","status":"discovered","priority":"medium"}],
  "projects":[{"name":"","agile_stage":"discovery","status":"active","scope":"","goals":"","deliverables":"","health_status":"on track"}],
  "requirements":[{"title":"","requirement_type":"functional","priority":"should","status":"proposed","description":"","acceptance_criteria":""}],
  "tasks":[{"title":"","description":"","status":"todo","task_type":"development|data_request|system_access|onboarding|meeting_action|support_ticket|training_material|handover_package|customer_questions","priority":"normal","expected_hours":0,"success_metrics":"","risks":"","due_date":"YYYY-MM-DD","userStoryTitle":"","form_schema":{"title":"","intro":"","fields":[{"name":"","label":"","type":"text|textarea|select|date|number|email","required":true,"help":"","options":[""]}]},"upload_items":[{"id":"","title":"","description":"","category":"sample data"}]}],
  "milestones":[{"name":"","stage":"","status":"not started","due_date":"YYYY-MM-DD","notes":""}],
  "estimates":[{"title":"","estimate_type":"planning estimate","hourly_rate":150,"hour_range_low":0,"hour_range_high":0,"assumptions":"","approval_status":"draft"}],
  "payments":[{"title":"","amount":0,"status":"planned","due_date":"YYYY-MM-DD","notes":"","visibility":"internal"}],
  "initialMeetings":[{"title":"","event_at":"ISO datetime if known, otherwise omit","duration_minutes":60,"event_type":"meeting","location":"Online","notes":"","visibility":"shared"}],
  "dataRequests":[{"title":"","requested_items":"","status":"open","due_date":"YYYY-MM-DD"}],
  "systemAccess":[{"system_name":"","access_type":"","status":"requested","safe_instructions":"","integration_status":"not started","notes":""}],
  "goals":[{"title":"","description":"","status":"active"}],
  "metrics":[{"name":"","baseline_value":"","target_value":"","measurement_method":"","status":"tracking"}],
  "risks":[{"title":"","description":"","severity":"medium","mitigation":"","status":"open"}],
  "openQuestions":[{"question":"","owner":"","status":"open"}],
  "tourSteps":[{"title":"","body":"","portalSection":"dashboard|documents|projects|knowledge|work|support|ai|admin"}]
}
`,
    input: `Lead:\n${JSON.stringify(lead, null, 2)}\n\nTranscript:\n${transcriptText(lead.transcript || [])}`,
  });

  return safeJson(response.output_text || "") || fallbackPlan(lead);
}

async function createClientOwnerInvite(clientId: string, lead: LeadPayload) {
  const existing = await selectOne<any>("portal_users", { email: eq(lead.email) });
  if (existing) {
    const hasAcceptedAccount = Boolean(existing.accepted_invite_at || existing.password_hash);

    if (!existing.client_id || !hasAcceptedAccount) {
      await updateRows("portal_users", { id: eq(existing.id) }, { client_id: clientId, role: existing.role || "client_owner" });
    }

    if (!hasAcceptedAccount) {
      const token = createToken();
      await insertRow("portal_invites", {
        client_id: clientId,
        email: lead.email,
        role: "client_owner",
        token_hash: hashToken(token),
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      });

      return {
        user: existing,
        inviteUrl: buildPortalUrl({ invite: token, email: lead.email }),
        kind: "invite",
      };
    }

    const token = createToken();
    await insertRow("portal_magic_links", {
      user_id: existing.id,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    });
    return {
      user: existing,
      inviteUrl: buildPortalUrl({ magic: token, email: lead.email }),
      kind: "magic",
    };
  }

  const user = await insertRow<any>("portal_users", {
    client_id: clientId,
    email: lead.email,
    display_name: lead.name || lead.email,
    role: "client_owner",
    invited_at: new Date().toISOString(),
  });
  const token = createToken();
  await insertRow("portal_invites", {
    client_id: clientId,
    email: lead.email,
    role: "client_owner",
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
  });

  return {
    user,
    inviteUrl: buildPortalUrl({ invite: token, email: lead.email }),
    kind: "invite",
  };
}

function projectIdPayload(row: Record<string, unknown>, projectId?: string) {
  return projectId ? { ...row, project_id: projectId } : row;
}

const COMMERCIAL_TABLES = new Set(["portal_estimates", "portal_payments", "portal_invoices", "portal_contracts", "portal_roi_notes"]);

async function insertMany(table: string, clientId: string, rows: Array<Record<string, unknown>> = [], projectId?: string) {
  const inserted = [];
  for (const row of rows.filter(Boolean)) {
    const commercialDefaults = COMMERCIAL_TABLES.has(table) && !("visibility" in row) ? { visibility: "internal" } : {};
    inserted.push(
      await insertRow<any>(table, {
        client_id: clientId,
        ...commercialDefaults,
        ...projectIdPayload(row, projectId),
      })
    );
  }
  return inserted;
}

function normalizeTitle(value: unknown): string {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function attachUserStoriesToTasks(tasks: Array<Record<string, unknown>> = [], requirements: Array<Record<string, unknown>> = []) {
  const byTitle = new Map(requirements.map((story) => [normalizeTitle(story.title), story]));
  return tasks.map((task) => {
    const storyTitle = (task.userStoryTitle || task.user_story_title) as string | undefined;
    const story = byTitle.get(normalizeTitle(storyTitle));
    const cleaned = { ...task };
    delete cleaned.userStoryTitle;
    delete cleaned.user_story_title;
    return story?.id ? { ...cleaned, user_story_id: story.id } : cleaned;
  });
}

function isClientOwnedTask(task: Record<string, unknown>) {
  const type = clean(task.task_type).toLowerCase();
  const title = clean(task.title).toLowerCase();
  return [
    "customer_questions",
    "data_request",
    "data_submission",
    "system_access",
    "onboarding",
    "meeting_action",
  ].includes(type) || /upload|provide|grant|appoint|confirm|answer|collect|choose|approve/.test(title);
}

async function findWinslowUser() {
  const users = await selectRows<any>("portal_users", {
    select: "id,display_name,email,role,disabled_at",
    order: "created_at.asc",
  }).catch(() => []);
  return users.find((user) =>
    !user.disabled_at
    && ["admin", "conneen_collaborator"].includes(user.role)
    && `${user.display_name || ""} ${user.email || ""}`.toLowerCase().includes("winslow")
  ) || users.find((user) =>
    !user.disabled_at && ["admin", "conneen_collaborator"].includes(user.role)
  ) || null;
}

function assignTasks(tasks: Array<Record<string, unknown>> = [], clientUserId?: string, winslowUserId?: string) {
  return tasks.map((task) => {
    if (task.assigned_to) return task;
    const assignedTo = isClientOwnedTask(task) ? clientUserId || winslowUserId : winslowUserId || clientUserId;
    return assignedTo ? { ...task, assigned_to: assignedTo } : task;
  });
}

function ensureCustomerQuestionTasks(tasks: Array<Record<string, unknown>> = [], openQuestions: Array<Record<string, unknown>> = []) {
  const hasQuestionForm = tasks.some((task) => {
    const schema = task.form_schema as Record<string, unknown> | undefined;
    return task.task_type === "customer_questions" && Array.isArray(schema?.fields) && schema.fields.length;
  });
  if (hasQuestionForm || !openQuestions.length) return tasks;

  const fields = openQuestions
    .slice(0, 8)
    .map((item, index) => ({
      name: `question_${index + 1}`,
      label: clean(item.question, `Question ${index + 1}`),
      type: "textarea",
      required: true,
      help: clean(item.owner) ? `Requested owner/context: ${clean(item.owner)}` : "",
    }));

  return [
    ...tasks,
    {
      title: "Answer Scout's setup questions",
      description: "Scout needs a few customer answers before the project workspace is fully ready.",
      status: "todo",
      task_type: "customer_questions",
      priority: "high",
      expected_hours: 0.5,
      success_metrics: "Customer answers are saved into Scout memory and available for admin review.",
      risks: "Without these answers, Scout may leave important assumptions unresolved.",
      due_date: nextBusinessDate(3),
      form_schema: {
        title: "Answer Scout's setup questions",
        intro: "These are the open questions Scout found while setting up the workspace.",
        fields,
      },
    },
  ];
}

function ensureUploadRequestTasks(tasks: Array<Record<string, unknown>> = [], dataRequests: Array<Record<string, unknown>> = []) {
  const hasUploadTask = tasks.some((task) => Array.isArray(task.upload_items) && task.upload_items.length);
  if (hasUploadTask || !dataRequests.length) return tasks;

  const uploadItems = dataRequests.slice(0, 8).map((request, index) => ({
    id: `requested_document_${index + 1}`,
    title: clean(request.title, `Requested document ${index + 1}`),
    description: clean(request.requested_items || request.description || request.notes, "Upload the requested material so Scout and the project team can review it."),
    category: "requested document",
  }));

  return [
    ...tasks,
    {
      title: "Upload requested documents",
      description: "Scout needs these files to complete the project setup and prepare the first review.",
      status: "todo",
      task_type: "data_request",
      priority: "high",
      expected_hours: 1,
      success_metrics: "All requested documents are uploaded and linked to the workspace.",
      risks: "Missing source material can delay workflow mapping, estimates, and prototype planning.",
      due_date: nextBusinessDate(5),
      upload_items: uploadItems,
    },
  ];
}

function normalizeCalendarRows(rows: Array<Record<string, unknown>> = []) {
  return rows.map((row) => ({
    title: clean(row.title, "Initial project meeting"),
    event_at: clean(row.event_at, nextInitialMeetingIso()),
    duration_minutes: Number(row.duration_minutes || 60),
    event_type: clean(row.event_type, "meeting"),
    location: clean(row.location, "Online"),
    notes: clean(row.notes, "Review the Scout-created workspace, confirm scope, and identify next data needed."),
    visibility: clean(row.visibility, "shared"),
  }));
}

async function tryPortalWrite<T>(label: string, warnings: string[], fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`${label}: ${message}`);
    console.error(`Portal provisioning warning (${label}):`, error);
    return null;
  }
}

export async function provisionPortalFromLead(lead: LeadPayload) {
  const plan = await buildProvisionPlan(lead);
  const clientName = clean(plan.clientProfile?.name, lead.company || lead.name || lead.email);
  const warnings: string[] = [];

  const client = await insertRow<any>("portal_clients", {
    name: clientName,
    industry: clean(plan.clientProfile?.industry) || null,
    primary_contact_name: lead.name || plan.contact?.name || null,
    primary_contact_email: lead.email,
    communication_style: clean(plan.clientProfile?.communicationStyle) || null,
    technical_comfort: clean(plan.clientProfile?.technicalComfort) || null,
    budget_notes: clean(plan.clientProfile?.budgetNotes) || null,
    created_from_lead_id: lead.id || null,
    admin_status: "pre-meeting workspace",
  });

  const invite = await createClientOwnerInvite(client.id, lead);
  const winslowUser = await findWinslowUser();

  await tryPortalWrite("contact", warnings, () =>
    insertRow("portal_contacts", {
      client_id: client.id,
      name: lead.name || plan.contact?.name || lead.email,
      email: lead.email,
      phone: lead.phone || null,
      title: clean(plan.contact?.title) || null,
      responsibilities: clean(plan.contact?.responsibilities, "Primary contact from Scout inquiry."),
      notes: clean(plan.contact?.notes) || null,
    })
  );

  await tryPortalWrite("transcript", warnings, () =>
    insertRow("portal_scout_transcripts", {
      client_id: client.id,
      diagnostic_lead_id: lead.id || null,
      title: "Initial Scout inquiry",
      transcript: lead.transcript || [],
      summary: lead.workflow_summary || null,
    })
  );

  await tryPortalWrite("business knowledge", warnings, () => insertMany("portal_business_knowledge", client.id, plan.businessKnowledge || []));
  const workflows = (await tryPortalWrite("workflows", warnings, () => insertMany("portal_workflows", client.id, plan.workflows || []))) || [];
  const projects = (await tryPortalWrite("projects", warnings, () => insertMany("portal_projects", client.id, plan.projects || []))) || [];
  const projectId = projects[0]?.id;

  await tryPortalWrite("milestones", warnings, () => insertMany("portal_milestones", client.id, plan.milestones || [], projectId));
  await tryPortalWrite("estimates", warnings, () => insertMany("portal_estimates", client.id, plan.estimates || [], projectId));
  await tryPortalWrite("payments", warnings, () => insertMany("portal_payments", client.id, plan.payments || [], projectId));
  const requirements = (await tryPortalWrite("requirements", warnings, () => insertMany("portal_requirements", client.id, plan.requirements || [], projectId))) || [];
  const tasks = assignTasks(
    ensureUploadRequestTasks(ensureCustomerQuestionTasks(plan.tasks || [], plan.openQuestions || []), plan.dataRequests || []),
    invite.user?.id,
    winslowUser?.id
  );
  await tryPortalWrite("tasks", warnings, () => insertMany("portal_tasks", client.id, attachUserStoriesToTasks(tasks, requirements), projectId));
  await tryPortalWrite("data requests", warnings, () => insertMany("portal_data_requests", client.id, plan.dataRequests || []));
  await tryPortalWrite("system access", warnings, () => insertMany("portal_system_access", client.id, plan.systemAccess || []));
  await tryPortalWrite("business goals", warnings, () => insertMany("portal_business_goals", client.id, plan.goals || []));
  await tryPortalWrite("success metrics", warnings, () => insertMany("portal_success_metrics", client.id, plan.metrics || [], projectId));
  await tryPortalWrite("risks", warnings, () => insertMany("portal_risks", client.id, plan.risks || [], projectId));
  await tryPortalWrite("open questions", warnings, () => insertMany("portal_open_questions", client.id, plan.openQuestions || [], projectId));
  await tryPortalWrite("initial meetings", warnings, () => insertMany("portal_calendar_events", client.id, normalizeCalendarRows(plan.initialMeetings || fallbackPlan(lead).initialMeetings || []), projectId));

  await tryPortalWrite("setup tour", warnings, async () => {
    for (const [index, step] of (plan.tourSteps || fallbackPlan(lead).tourSteps || []).entries()) {
      await insertRow("portal_tour_steps", {
        client_id: client.id,
        title: step.title,
        body: step.body,
        portal_section: step.portalSection || "dashboard",
        sort_order: index + 1,
        visibility: "shared",
      });
    }
  });

  await tryPortalWrite("timeline event", warnings, () =>
    insertRow("portal_timeline_events", {
      client_id: client.id,
      project_id: projectId || null,
      event_type: "workspace_provisioned",
      title: "Scout created this pre-meeting workspace",
      description: "The workspace was populated from the initial Scout inquiry before the first meeting.",
    })
  );

  await tryPortalWrite("notification", warnings, () =>
    insertRow("portal_notifications", {
      client_id: client.id,
      title: "Your setup tour is ready",
      body: "Review the setup tour on your dashboard to see where Scout stored the project information from your conversation.",
    })
  );

  const inviteEmailSent = await sendPortalLinkEmail({
    clientId: client.id,
    userId: invite.user?.id || null,
    to: lead.email,
    subject: "Your Conneen AI workspace is ready",
    heading: "Your Conneen AI workspace is ready",
    intro: `Scout created a private workspace for ${clientName}. It includes the conversation summary, project notes, data requests, and a custom setup tour before the first meeting.`,
    linkText: invite.kind === "magic" ? "Open your portal workspace" : "Create your portal account",
    url: invite.inviteUrl,
  });

  return secretLinkPayload("inviteUrl", invite.inviteUrl, {
    clientId: client.id,
    projectId,
    workflowId: workflows[0]?.id,
    inviteKind: invite.kind,
    inviteEmailSent,
    message: inviteEmailSent
      ? "Workspace created and portal email sent."
      : shouldReturnSecretLinks()
        ? "Workspace created. Email delivery is not configured, so the local invite link is shown."
        : "Workspace created, but email delivery is not configured. No invite link was returned in this environment.",
    warnings,
  });
}
