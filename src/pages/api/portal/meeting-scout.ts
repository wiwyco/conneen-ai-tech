import OpenAI from "openai";
import crypto from "node:crypto";
import type { APIRoute } from "astro";
import { authenticateRequest, canAccessClient } from "../../../lib/portal/auth";
import { getClientContext } from "../../../lib/portal/ai";
import { getEnv } from "../../../lib/portal/env";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { canPortalAction } from "../../../lib/portal/permissions";
import { eq, insertRow, order, selectRows, updateRows } from "../../../lib/portal/supabase";

export const prerender = false;

type TranscriptLine = {
  speaker: string;
  text: string;
  at: string;
};

type ScoutResponseLine = {
  speaker: "Scout";
  requestedBy: string;
  delivery: "voice" | "chat";
  text: string;
  at: string;
  status: "ready" | "stopped";
  speakerRoleGuess?: string;
};

type MeetingExtractionPlan = {
  meetingNote?: {
    title?: string;
    attendees?: string;
    notes?: string;
    visibility?: "shared" | "internal";
  };
  tasks?: Array<Record<string, unknown>>;
  userStories?: Array<Record<string, unknown>>;
  decisions?: Array<Record<string, unknown>>;
  openQuestions?: Array<Record<string, unknown>>;
  milestones?: Array<Record<string, unknown>>;
  risks?: Array<Record<string, unknown>>;
  successMetrics?: Array<Record<string, unknown>>;
  estimates?: Array<Record<string, unknown>>;
  dataRequests?: Array<Record<string, unknown>>;
  systemAccess?: Array<Record<string, unknown>>;
  deliverables?: Array<Record<string, unknown>>;
  trainingMaterials?: Array<Record<string, unknown>>;
  changeRequests?: Array<Record<string, unknown>>;
  businessGoals?: Array<Record<string, unknown>>;
};

function isMeetingSecretOk(request: Request) {
  const webhookSecret = getEnv("SCOUT_MEETING_WEBHOOK_SECRET");
  const providedSecret = request.headers.get("x-scout-meeting-secret") || "";
  const providedSecretHash = request.headers.get("x-scout-meeting-secret-hash") || "";
  return Boolean(
    webhookSecret
    && (providedSecret === webhookSecret || providedSecretHash === fingerprint(webhookSecret))
  );
}

function transcriptText(lines: TranscriptLine[], limit = 120, maxChars = 24000) {
  return lines
    .slice(-limit)
    .map((line) => `${line.speaker || "Speaker"}: ${line.text}`)
    .join("\n")
    .slice(-maxChars);
}

function safeJson<T = any>(value: string): T | null {
  const raw = (value || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeDate(value: unknown) {
  const text = cleanText(value, 40);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function visibility(value: unknown) {
  return cleanText(value, 20) === "internal" ? "internal" : "shared";
}

function normalizeTitle(value: unknown) {
  return cleanText(value, 300).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeTranscriptInput(body: Record<string, unknown>, existing: TranscriptLine[]) {
  const transcriptLines = Array.isArray(body.transcript)
    ? body.transcript
    : Array.isArray(body.transcriptLines)
      ? body.transcriptLines
      : [];
  if (transcriptLines.length) {
    return transcriptLines.map((line: any) => ({
      speaker: cleanText(line?.speaker, 80) || "Speaker",
      text: cleanText(line?.text, 4000),
      at: cleanText(line?.at, 80) || new Date().toISOString(),
    })).filter((line) => line.text);
  }

  const fullTranscript = cleanText(body.fullTranscript, 50000) || cleanText(body.transcriptText, 50000);
  if (!fullTranscript) return existing;

  return fullTranscript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf(":");
      if (index === -1 || index > 80) {
        return { speaker: "Speaker", text: line, at: new Date().toISOString() };
      }
      return {
        speaker: cleanText(line.slice(0, index), 80) || "Speaker",
        text: cleanText(line.slice(index + 1), 4000),
        at: new Date().toISOString(),
      };
    })
    .filter((line) => line.text);
}

function compactClientContext(context: Awaited<ReturnType<typeof getClientContext>>) {
  const keep: Record<string, unknown> = {
    client: context.client,
    projects: context.sections.projects,
    workflows: context.sections.workflows,
    pain_points: context.sections.pain_points,
    opportunities: context.sections.opportunities,
    requirements: context.sections.requirements,
    tasks: context.sections.tasks,
    milestones: context.sections.milestones,
    estimates: context.sections.estimates,
    business_knowledge: context.sections.business_knowledge,
    decisions: context.sections.decisions,
    business_goals: context.sections.business_goals,
    success_metrics: context.sections.success_metrics,
    risks: context.sections.risks,
    open_questions: context.sections.open_questions,
    meetings: context.sections.meetings,
  };
  return JSON.stringify(keep, null, 2).slice(0, 22000);
}

function normalizeCommandText(text: string) {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function fingerprint(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function hasWakePhrase(text: string) {
  const normalized = normalizeCommandText(text);
  return normalized.includes("listen up scout") || normalized.includes("listen scout");
}

function hasStopPhrase(text: string) {
  const normalized = normalizeCommandText(text);
  return normalized.includes("that s enough scout") || normalized.includes("thats enough scout") || normalized.includes("stop scout");
}

function wantsChatDelivery(text: string) {
  const normalized = normalizeCommandText(text);
  return normalized.includes("put") && normalized.includes("chat")
    || normalized.includes("send") && normalized.includes("chat")
    || normalized.includes("post") && normalized.includes("chat")
    || normalized.includes("meeting chat");
}

function fallbackSummary(lines: TranscriptLine[]) {
  const text = transcriptText(lines);
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    notes: sentences.slice(0, 8).join(" ") || "Scout is waiting for live meeting transcript updates.",
    takeaways: sentences.slice(-5).map((item) => `- ${item}`).join("\n") || "- No key takeaways yet.",
    deliverables: "- Draft deliverables will appear as Scout receives more meeting context.",
  };
}

function artifactText(value: unknown, fallback: string) {
  if (Array.isArray(value)) {
    return value.map((item) => `- ${cleanText(item, 1000)}`).filter((item) => item !== "- ").join("\n") || fallback;
  }
  return cleanText(value, 8000) || fallback;
}

async function generateMeetingArtifacts(event: any, lines: TranscriptLine[]) {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey || !lines.length) return fallbackSummary(lines);

  const client = new OpenAI({ apiKey });
  const model = getEnv("OPENAI_MODEL") || "gpt-5-mini";
  const response = await client.responses.create({
    model,
    reasoning: { effort: "low" },
    instructions: `
You are Scout, Conneen AI's meeting assistant.
Turn the live meeting transcript into concise, client-ready working notes before the meeting ends.
Return only JSON with these string keys: notes, takeaways, deliverables.
Notes should be a useful meeting-notes summary.
Takeaways should be short bullets with decisions, blockers, and follow-ups.
Deliverables should be short bullets for artifacts or work products Conneen AI may need to draft.
Do not invent facts. If something is uncertain, mark it as needs confirmation.
`,
    input: `Meeting title: ${event.title || "Meeting"}\nScheduled time: ${event.event_at || ""}\nAgenda notes: ${event.notes || ""}\n\nTranscript:\n${transcriptText(lines)}`,
  });

  const raw = (response.output_text?.trim() || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(raw);
    const fallback = fallbackSummary(lines);
    return {
      notes: artifactText(parsed.notes, fallback.notes),
      takeaways: artifactText(parsed.takeaways, fallback.takeaways),
      deliverables: artifactText(parsed.deliverables, fallback.deliverables),
    };
  } catch {
    return {
      notes: raw || fallbackSummary(lines).notes,
      takeaways: fallbackSummary(lines).takeaways,
      deliverables: fallbackSummary(lines).deliverables,
    };
  }
}

async function generateMeetingExtractionPlan({
  clientId,
  event,
  lines,
  artifacts,
}: {
  clientId: string;
  event: any;
  lines: TranscriptLine[];
  artifacts: Awaited<ReturnType<typeof generateMeetingArtifacts>>;
}): Promise<MeetingExtractionPlan> {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey || !lines.length) {
    return {
      meetingNote: {
        title: event.title || "Meeting notes",
        notes: artifacts.notes,
        visibility: "shared",
      },
      tasks: [],
      deliverables: [],
    };
  }

  const clientContext = await getClientContext(clientId).catch(() => null);
  const contextText = clientContext ? compactClientContext(clientContext) : "{}";
  const client = new OpenAI({ apiKey });
  const model = getEnv("OPENAI_MODEL") || "gpt-5-mini";
  const response = await client.responses.create({
    model,
    reasoning: { effort: "low" },
    instructions: `
You are Scout, Conneen AI's post-meeting operations assistant.
Extract durable portal records from a completed scheduled meeting transcript.
Return only valid JSON. Do not include markdown.

Create records only when the transcript supports them. Do not invent commitments.
Use concise, readable summaries that preserve important owners, dates, constraints, and open loops.
If a statement is uncertain, create an open question instead of a task or decision.
Tasks should be concrete work items. Assign "assignee" as either "Winslow" for Conneen AI work or "client" for customer-owned work.
Deliverables should be outputs/artifacts Conneen AI should produce or hand over.
User stories should be end-user capabilities or desired outcomes, not generic tasks.

JSON shape:
{
  "meetingNote":{"title":"","attendees":"","notes":"","visibility":"shared"},
  "tasks":[{"title":"","description":"","task_type":"development|data_request|system_access|onboarding|meeting_action|support_ticket|training_material|handover_package|customer_questions","priority":"normal|high|low","expected_hours":0,"success_metrics":"","risks":"","due_date":"YYYY-MM-DD or null","assignee":"Winslow|client","userStoryTitle":""}],
  "userStories":[{"title":"","description":"","priority":"should|must|could","acceptance_criteria":"","status":"proposed"}],
  "decisions":[{"title":"","decision":"","rationale":"","decided_by":"","decided_at":"YYYY-MM-DD or null","visibility":"shared"}],
  "openQuestions":[{"question":"","owner":"","status":"open","answer":"","visibility":"shared"}],
  "milestones":[{"name":"","stage":"","status":"not started","due_date":"YYYY-MM-DD or null","notes":""}],
  "estimates":[{"title":"","estimate_type":"planning estimate","hour_range_low":0,"hour_range_high":0,"hourly_rate":150,"assumptions":"","approval_status":"draft"}],
  "risks":[{"title":"","description":"","severity":"low|medium|high","mitigation":"","status":"open"}],
  "successMetrics":[{"name":"","baseline_value":"","target_value":"","current_value":"","measurement_method":"","status":"tracking"}],
  "dataRequests":[{"title":"","requested_items":"","status":"open","due_date":"YYYY-MM-DD or null"}],
  "systemAccess":[{"system_name":"","access_type":"","status":"requested","owner_contact":"","safe_instructions":"","integration_status":"not started","notes":""}],
  "deliverables":[{"title":"","description":"","status":"draft","visibility":"shared"}],
  "trainingMaterials":[{"title":"","material_type":"guide","description":"","url":"","visibility":"shared"}],
  "changeRequests":[{"title":"","description":"","status":"requested","impact_notes":"","approval_notes":""}],
  "businessGoals":[{"title":"","description":"","status":"active","target_date":"YYYY-MM-DD or null"}]
}
`,
    input: `
Existing portal context:
${contextText}

Meeting:
${JSON.stringify({ title: event.title, event_at: event.event_at, notes: event.notes, project_id: event.project_id }, null, 2)}

Scout meeting artifacts:
${JSON.stringify(artifacts, null, 2)}

Full transcript:
${transcriptText(lines, 500, 60000)}
`,
  });

  return safeJson<MeetingExtractionPlan>(response.output_text || "") || {
    meetingNote: {
      title: event.title || "Meeting notes",
      notes: artifacts.notes,
      visibility: "shared",
    },
    tasks: [],
    deliverables: [],
  };
}

function fallbackMeetingResponse(line: TranscriptLine, delivery: "voice" | "chat") {
  const text = line.text.replace(/listen up scout/ig, "").trim();
  return {
    shouldRespond: true,
    delivery,
    response: text
      ? `I heard you. Based on the meeting so far, I would treat that as a follow-up item and confirm the details before adding it to the project record.`
      : `I'm here. Ask me the specific question and I will answer from the portal context and this meeting so far.`,
    speakerRoleGuess: line.speaker || "Speaker",
  };
}

async function generateMeetingResponse({
  clientId,
  event,
  lines,
  line,
  priorResponses,
  delivery,
}: {
  clientId: string;
  event: any;
  lines: TranscriptLine[];
  line: TranscriptLine;
  priorResponses: ScoutResponseLine[];
  delivery: "voice" | "chat";
}) {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) return fallbackMeetingResponse(line, delivery);

  const clientContext = await getClientContext(clientId).catch(() => null);
  const contextText = clientContext ? compactClientContext(clientContext) : "{}";
  const client = new OpenAI({ apiKey });
  const model = getEnv("OPENAI_MODEL") || "gpt-5-mini";
  const response = await client.responses.create({
    model,
    reasoning: { effort: "low" },
    instructions: `
You are Scout, Conneen AI's live meeting assistant.
You answer only because someone said "listen up, Scout" or because Scout is already in an addressed back-and-forth.
Use the client portal context and the transcript so far. Do not invent facts.
Infer who is speaking from names when possible. Winslow Conneen is Conneen AI. Other named speakers are usually customers or client team members.
Keep voice responses conversational and quick: normally 1-4 sentences. Go deeper only if the question truly needs detail.
If the user asks for the output in the meeting chat, set delivery to "chat" and make the answer more structured.
If the user says "that's enough, Scout", the server handles stopping and you should not answer.
Return only JSON with:
{
  "shouldRespond": true,
  "delivery": "voice" or "chat",
  "response": "Scout's answer",
  "speakerRoleGuess": "brief guess, like Winslow/Conneen AI, customer owner, client team member"
}
`,
    input: `
Client portal context:
${contextText}

Meeting:
${JSON.stringify({ title: event.title, event_at: event.event_at, agenda: event.notes }, null, 2)}

Transcript so far:
${transcriptText(lines)}

Prior Scout live responses:
${JSON.stringify(priorResponses.slice(-12), null, 2)}

Latest addressed speaker turn:
${line.speaker}: ${line.text}

Default delivery: ${delivery}
`,
  });

  const raw = (response.output_text?.trim() || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(raw);
    const output = cleanText(parsed.response, 3000);
    return {
      shouldRespond: parsed.shouldRespond !== false && Boolean(output),
      delivery: parsed.delivery === "chat" ? "chat" : delivery,
      response: output,
      speakerRoleGuess: cleanText(parsed.speakerRoleGuess, 120),
    };
  } catch {
    return {
      shouldRespond: Boolean(raw),
      delivery,
      response: cleanText(raw, 3000) || fallbackMeetingResponse(line, delivery).response,
      speakerRoleGuess: line.speaker || "Speaker",
    };
  }
}

async function findAssignmentUsers(clientId: string) {
  const [clientUsers, allUsers] = await Promise.all([
    selectRows<any>("portal_users", {
      select: "id,display_name,email,role,disabled_at",
      client_id: eq(clientId),
      order: order("created_at", true),
      limit: 20,
    }).catch(() => []),
    selectRows<any>("portal_users", {
      select: "id,display_name,email,role,disabled_at",
      order: order("created_at", true),
      limit: 100,
    }).catch(() => []),
  ]);
  const clientUser = clientUsers.find((user) => !user.disabled_at) || null;
  const winslowUser = allUsers.find((user) =>
    !user.disabled_at
    && ["admin", "conneen_collaborator"].includes(user.role)
    && `${user.display_name || ""} ${user.email || ""}`.toLowerCase().includes("winslow")
  ) || allUsers.find((user) => !user.disabled_at && ["admin", "conneen_collaborator"].includes(user.role)) || null;
  return { clientUser, winslowUser };
}

function assigneeId(row: Record<string, unknown>, users: Awaited<ReturnType<typeof findAssignmentUsers>>) {
  const assignee = cleanText(row.assignee || row.owner || row.assigned_to_label, 80).toLowerCase();
  const taskType = cleanText(row.task_type, 80).toLowerCase();
  const title = cleanText(row.title, 300).toLowerCase();
  const clientOwned = assignee.includes("client")
    || ["customer_questions", "data_request", "system_access", "onboarding"].includes(taskType)
    || /client|customer|upload|provide|grant|answer|confirm|approve|choose/.test(title);
  return clientOwned ? users.clientUser?.id || users.winslowUser?.id || null : users.winslowUser?.id || users.clientUser?.id || null;
}

async function insertMeetingRecord(table: string, payload: Record<string, unknown>, created: Record<string, any[]>) {
  const row = await insertRow<any>(table, payload);
  if (!created[table]) created[table] = [];
  created[table].push(row);
  return row;
}

async function injectMeetingObjects({
  auth,
  clientId,
  event,
  plan,
}: {
  auth: Awaited<ReturnType<typeof authenticateRequest>>;
  clientId: string;
  event: any;
  plan: MeetingExtractionPlan;
}) {
  const created: Record<string, any[]> = {};
  const warnings: string[] = [];
  const projectId = cleanText(event.project_id, 80) || null;
  const users = await findAssignmentUsers(clientId);
  const today = new Date().toISOString().slice(0, 10);

  async function write(label: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${label}: ${message}`);
      console.warn(`Meeting object injection skipped ${label}:`, error);
    }
  }

  const requirementsByTitle = new Map<string, any>();
  await write("meeting note", async () => {
    const note = plan.meetingNote || {};
    await insertMeetingRecord("portal_meetings", {
      client_id: clientId,
      project_id: projectId,
      title: cleanText(note.title, 300) || event.title || "Meeting notes",
      meeting_at: event.event_at || new Date().toISOString(),
      attendees: cleanText(note.attendees, 1000) || null,
      notes: cleanText(note.notes, 12000) || cleanText(event.scout_meeting_notes, 12000) || null,
      visibility: visibility(note.visibility),
      created_by: auth?.user.id || null,
    }, created);
  });

  for (const story of plan.userStories || []) {
    await write(`user story ${cleanText(story.title, 80)}`, async () => {
      const row = await insertMeetingRecord("portal_requirements", {
        client_id: clientId,
        project_id: projectId,
        requirement_type: "user story",
        title: cleanText(story.title, 300) || "Meeting user story",
        description: cleanText(story.description, 4000) || null,
        priority: cleanText(story.priority, 40) || "should",
        status: cleanText(story.status, 40) || "proposed",
        acceptance_criteria: cleanText(story.acceptance_criteria, 4000) || null,
        visibility: visibility(story.visibility),
      }, created);
      requirementsByTitle.set(normalizeTitle(row.title), row);
    });
  }

  for (const task of plan.tasks || []) {
    await write(`task ${cleanText(task.title, 80)}`, async () => {
      const storyTitle = normalizeTitle(task.userStoryTitle || task.user_story_title);
      const requirement = storyTitle ? requirementsByTitle.get(storyTitle) : null;
      await insertMeetingRecord("portal_tasks", {
        client_id: clientId,
        project_id: projectId,
        user_story_id: requirement?.id || null,
        title: cleanText(task.title, 300) || "Meeting follow-up",
        description: cleanText(task.description, 6000) || null,
        status: cleanText(task.status, 40) || "todo",
        task_type: cleanText(task.task_type, 80) || "meeting_action",
        priority: cleanText(task.priority, 40) || "normal",
        expected_hours: numberOrNull(task.expected_hours),
        success_metrics: cleanText(task.success_metrics, 4000) || null,
        risks: cleanText(task.risks, 4000) || null,
        due_date: normalizeDate(task.due_date),
        visibility: visibility(task.visibility),
        assigned_to: assigneeId(task, users),
        created_by: auth?.user.id || null,
      }, created);
    });
  }

  for (const item of plan.deliverables || []) {
    await write(`deliverable ${cleanText(item.title, 80)}`, async () => {
      await insertMeetingRecord("portal_handover_items", {
        client_id: clientId,
        project_id: projectId,
        title: cleanText(item.title, 300) || "Meeting deliverable",
        description: cleanText(item.description, 5000) || null,
        status: cleanText(item.status, 40) || "draft",
        visibility: visibility(item.visibility),
      }, created);
    });
  }

  for (const decision of plan.decisions || []) {
    await write(`decision ${cleanText(decision.title, 80)}`, async () => {
      await insertMeetingRecord("portal_decisions", {
        client_id: clientId,
        project_id: projectId,
        title: cleanText(decision.title, 300) || "Meeting decision",
        decision: cleanText(decision.decision, 5000) || cleanText(decision.title, 300) || "Decision captured from meeting",
        rationale: cleanText(decision.rationale, 5000) || null,
        decided_by: cleanText(decision.decided_by, 300) || null,
        decided_at: normalizeDate(decision.decided_at) || today,
        visibility: visibility(decision.visibility),
      }, created);
    });
  }

  for (const question of plan.openQuestions || []) {
    await write(`open question ${cleanText(question.question, 80)}`, async () => {
      await insertMeetingRecord("portal_open_questions", {
        client_id: clientId,
        project_id: projectId,
        question: cleanText(question.question, 1000) || "Open question from meeting",
        owner: cleanText(question.owner, 300) || null,
        status: cleanText(question.status, 40) || "open",
        answer: cleanText(question.answer, 3000) || null,
        visibility: visibility(question.visibility),
      }, created);
    });
  }

  for (const milestone of plan.milestones || []) {
    await write(`milestone ${cleanText(milestone.name, 80)}`, async () => {
      await insertMeetingRecord("portal_milestones", {
        client_id: clientId,
        project_id: projectId,
        name: cleanText(milestone.name, 300) || "Meeting milestone",
        stage: cleanText(milestone.stage, 80) || "delivery",
        status: cleanText(milestone.status, 80) || "not started",
        due_date: normalizeDate(milestone.due_date),
        notes: cleanText(milestone.notes, 4000) || null,
      }, created);
    });
  }

  for (const estimate of plan.estimates || []) {
    await write(`estimate ${cleanText(estimate.title, 80)}`, async () => {
      await insertMeetingRecord("portal_estimates", {
        client_id: clientId,
        project_id: projectId,
        title: cleanText(estimate.title, 300) || "Meeting planning estimate",
        estimate_type: cleanText(estimate.estimate_type, 80) || "planning estimate",
        hourly_rate: numberOrNull(estimate.hourly_rate) || 150,
        hour_range_low: numberOrNull(estimate.hour_range_low),
        hour_range_high: numberOrNull(estimate.hour_range_high),
        assumptions: cleanText(estimate.assumptions, 5000) || null,
        approval_status: cleanText(estimate.approval_status, 80) || "draft",
        visibility: "internal",
      }, created);
    });
  }

  for (const risk of plan.risks || []) {
    await write(`risk ${cleanText(risk.title, 80)}`, async () => {
      await insertMeetingRecord("portal_risks", {
        client_id: clientId,
        project_id: projectId,
        title: cleanText(risk.title, 300) || "Meeting risk",
        description: cleanText(risk.description, 5000) || null,
        severity: cleanText(risk.severity, 40) || "medium",
        mitigation: cleanText(risk.mitigation, 5000) || null,
        status: cleanText(risk.status, 40) || "open",
      }, created);
    });
  }

  for (const metric of plan.successMetrics || []) {
    await write(`metric ${cleanText(metric.name, 80)}`, async () => {
      await insertMeetingRecord("portal_success_metrics", {
        client_id: clientId,
        project_id: projectId,
        name: cleanText(metric.name, 300) || "Meeting success metric",
        baseline_value: cleanText(metric.baseline_value, 1000) || null,
        target_value: cleanText(metric.target_value, 1000) || null,
        current_value: cleanText(metric.current_value, 1000) || null,
        measurement_method: cleanText(metric.measurement_method, 3000) || null,
        status: cleanText(metric.status, 40) || "tracking",
      }, created);
    });
  }

  for (const request of plan.dataRequests || []) {
    await write(`data request ${cleanText(request.title, 80)}`, async () => {
      await insertMeetingRecord("portal_data_requests", {
        client_id: clientId,
        title: cleanText(request.title, 300) || "Meeting data request",
        requested_items: cleanText(request.requested_items, 5000) || null,
        status: cleanText(request.status, 40) || "open",
        due_date: normalizeDate(request.due_date),
        requested_by: auth?.user.id || null,
      }, created);
    });
  }

  for (const system of plan.systemAccess || []) {
    await write(`system access ${cleanText(system.system_name, 80)}`, async () => {
      await insertMeetingRecord("portal_system_access", {
        client_id: clientId,
        system_name: cleanText(system.system_name, 300) || "System access request",
        access_type: cleanText(system.access_type, 300) || null,
        status: cleanText(system.status, 40) || "requested",
        owner_contact: cleanText(system.owner_contact, 300) || null,
        safe_instructions: cleanText(system.safe_instructions, 5000) || null,
        integration_status: cleanText(system.integration_status, 80) || "not started",
        notes: cleanText(system.notes, 5000) || null,
      }, created);
    });
  }

  for (const material of plan.trainingMaterials || []) {
    await write(`training material ${cleanText(material.title, 80)}`, async () => {
      await insertMeetingRecord("portal_training_materials", {
        client_id: clientId,
        project_id: projectId,
        title: cleanText(material.title, 300) || "Meeting training material",
        material_type: cleanText(material.material_type, 80) || "guide",
        description: cleanText(material.description, 5000) || null,
        url: cleanText(material.url, 2000) || null,
        visibility: visibility(material.visibility),
      }, created);
    });
  }

  for (const change of plan.changeRequests || []) {
    await write(`change request ${cleanText(change.title, 80)}`, async () => {
      await insertMeetingRecord("portal_change_requests", {
        client_id: clientId,
        project_id: projectId,
        title: cleanText(change.title, 300) || "Meeting change request",
        description: cleanText(change.description, 5000) || null,
        status: cleanText(change.status, 40) || "requested",
        impact_notes: cleanText(change.impact_notes, 5000) || null,
        approval_notes: cleanText(change.approval_notes, 5000) || null,
      }, created);
    });
  }

  for (const goal of plan.businessGoals || []) {
    await write(`business goal ${cleanText(goal.title, 80)}`, async () => {
      await insertMeetingRecord("portal_business_goals", {
        client_id: clientId,
        title: cleanText(goal.title, 300) || "Meeting business goal",
        description: cleanText(goal.description, 5000) || null,
        status: cleanText(goal.status, 40) || "active",
        target_date: normalizeDate(goal.target_date),
      }, created);
    });
  }

  const createdCounts = Object.fromEntries(Object.entries(created).map(([table, rows]) => [table, rows.length]));
  await insertMeetingRecord("portal_timeline_events", {
    client_id: clientId,
    project_id: projectId,
    event_type: "meeting_processed",
    title: `Scout processed meeting: ${event.title || "Meeting"}`,
    description: `Created portal records from meeting transcript: ${Object.entries(createdCounts).map(([table, count]) => `${table}: ${count}`).join(", ") || "meeting notes only"}`,
    actor_user_id: auth?.user.id || null,
    source_table: "portal_calendar_events",
    source_id: event.id,
    visibility: "shared",
  }, created);

  return { created, createdCounts, warnings };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const eventId = cleanText(body.eventId, 80);
    const clientId = cleanText(body.clientId, 80);
    if (!eventId || !clientId) return jsonResponse({ error: "Meeting and client id are required." }, 400);

    const auth = await authenticateRequest(request);
    const secretOk = isMeetingSecretOk(request);
    if (!auth && !secretOk) return jsonResponse({ error: "Authentication required." }, 401);
    if (auth && !canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);

    const rows = await selectRows<any>("portal_calendar_events", {
      id: eq(eventId),
      client_id: eq(clientId),
      limit: 1,
    });
    const event = rows[0];
    if (!event) return jsonResponse({ error: "Meeting not found." }, 404);
    if (auth && !await canPortalAction(auth, { section: "calendar_events", action: "update", clientId, projectId: event.project_id, recordId: event.id, record: event })) {
      return jsonResponse({ error: "Forbidden." }, 403);
    }

    const transcript = Array.isArray(event.scout_live_transcript) ? event.scout_live_transcript : [];
    const responses = Array.isArray(event.scout_live_responses) ? event.scout_live_responses : [];
    const action = cleanText(body.action, 80) || "append_transcript";
    const shouldFinalize = action === "finalize" || action === "process_transcript";
    let nextTranscript: TranscriptLine[] = shouldFinalize
      ? normalizeTranscriptInput(body, transcript)
      : transcript.slice(-180);
    const nextResponses: ScoutResponseLine[] = responses.slice(-80);
    let scoutIsAddressed = Boolean(event.scout_is_addressed);
    let responseDelivery: "voice" | "chat" = event.scout_response_delivery === "chat" ? "chat" : "voice";
    let latestResponse = cleanText(event.scout_latest_response, 4000);
    let latestResponseAt = event.scout_latest_response_at || null;
    let stopRequestedAt = event.scout_stop_requested_at || null;
    let scoutOutput: { shouldRespond: boolean; delivery: "voice" | "chat"; response: string; stopRequested: boolean } = {
      shouldRespond: false,
      delivery: responseDelivery,
      response: "",
      stopRequested: false,
    };

    if (shouldFinalize && event.scout_meeting_status === "complete" && body.force !== true) {
      return jsonResponse({
        event,
        scout: scoutOutput,
        createdCounts: {},
        warnings: ["This meeting has already been processed. Send force: true to process it again."],
      });
    }

    if (action === "append_transcript") {
      const text = cleanText(body.text, 4000);
      if (!text) return jsonResponse({ error: "Transcript text is required." }, 400);
      const line = {
        speaker: cleanText(body.speaker, 80) || "Speaker",
        text,
        at: cleanText(body.at, 80) || new Date().toISOString(),
      };
      nextTranscript.push(line);

      if (hasStopPhrase(text)) {
        scoutIsAddressed = false;
        stopRequestedAt = new Date().toISOString();
        latestResponse = "";
        scoutOutput = {
          shouldRespond: false,
          delivery: responseDelivery,
          response: "",
          stopRequested: true,
        };
        nextResponses.push({
          speaker: "Scout",
          requestedBy: line.speaker,
          delivery: responseDelivery,
          text: "[Scout stopped responding]",
          at: stopRequestedAt,
          status: "stopped",
          speakerRoleGuess: line.speaker,
        });
      } else {
        const wake = hasWakePhrase(text);
        if (wake) scoutIsAddressed = true;
        const shouldRespond = wake || scoutIsAddressed;
        responseDelivery = wantsChatDelivery(text) ? "chat" : responseDelivery;
        if (shouldRespond) {
          const meetingResponse = await generateMeetingResponse({
            clientId,
            event,
            lines: nextTranscript,
            line,
            priorResponses: nextResponses,
            delivery: responseDelivery,
          });
          if (meetingResponse.shouldRespond) {
            responseDelivery = meetingResponse.delivery;
            latestResponse = meetingResponse.response;
            latestResponseAt = new Date().toISOString();
            scoutOutput = {
              shouldRespond: true,
              delivery: responseDelivery,
              response: latestResponse,
              stopRequested: false,
            };
            nextResponses.push({
              speaker: "Scout",
              requestedBy: line.speaker,
              delivery: responseDelivery,
              text: latestResponse,
              at: latestResponseAt,
              status: "ready",
              speakerRoleGuess: meetingResponse.speakerRoleGuess,
            });
          }
        }
      }
    }

    const artifacts = await generateMeetingArtifacts(event, nextTranscript);
    let injection: Awaited<ReturnType<typeof injectMeetingObjects>> | null = null;
    if (shouldFinalize) {
      const extractionPlan = await generateMeetingExtractionPlan({ clientId, event, lines: nextTranscript, artifacts });
      injection = await injectMeetingObjects({
        auth,
        clientId,
        event: { ...event, scout_meeting_notes: artifacts.notes },
        plan: extractionPlan,
      });
    }
    const updated = await updateRows<any>(
      "portal_calendar_events",
      { id: eq(eventId), client_id: eq(clientId) },
      {
        scout_meeting_status: shouldFinalize ? "complete" : "live_notes",
        scout_live_transcript: nextTranscript,
        scout_meeting_notes: artifacts.notes,
        scout_key_takeaways: artifacts.takeaways,
        scout_draft_deliverables: artifacts.deliverables,
        scout_live_responses: nextResponses,
        scout_is_addressed: scoutIsAddressed,
        scout_response_delivery: responseDelivery,
        scout_latest_response: latestResponse,
        scout_latest_response_at: latestResponseAt,
        scout_stop_requested_at: stopRequestedAt,
        scout_last_summary_at: new Date().toISOString(),
      }
    );

    return jsonResponse({
      event: updated[0] || null,
      scout: scoutOutput,
      createdCounts: injection?.createdCounts || {},
      created: injection?.created || {},
      warnings: injection?.warnings || [],
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not update Scout meeting notes." }, 500);
  }
};

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const eventId = cleanText(url.searchParams.get("eventId"), 80);
    const clientId = cleanText(url.searchParams.get("clientId"), 80);
    if (!eventId || !clientId) return jsonResponse({ error: "Meeting and client id are required." }, 400);

    const auth = await authenticateRequest(request);
    const secretOk = isMeetingSecretOk(request);
    if (!auth && !secretOk) return jsonResponse({ error: "Authentication required." }, 401);
    if (auth && !canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);

    const rows = await selectRows<any>("portal_calendar_events", {
      id: eq(eventId),
      client_id: eq(clientId),
      limit: 1,
    });
    const event = rows[0];
    if (!event) return jsonResponse({ error: "Meeting not found." }, 404);
    if (auth && !await canPortalAction(auth, { section: "calendar_events", action: "read", clientId, projectId: event.project_id, recordId: event.id, record: event })) {
      return jsonResponse({ error: "Forbidden." }, 403);
    }

    return jsonResponse({
      event,
      scout: {
        shouldRespond: Boolean(event.scout_latest_response),
        delivery: event.scout_response_delivery === "chat" ? "chat" : "voice",
        response: cleanText(event.scout_latest_response, 4000),
        responseAt: event.scout_latest_response_at || null,
        stopRequested: Boolean(event.scout_stop_requested_at),
      },
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not fetch Scout meeting notes." }, 500);
  }
};
