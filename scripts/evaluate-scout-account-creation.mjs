import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const OUT_DIR = path.resolve(process.cwd(), "scout-account-evals");
const DEFAULT_BASE_URL = "http://localhost:4321";
const SCOUT_OPENING =
  "I'm Scout, Conneen AI's workflow guide. I help growing businesses find the expensive, time-sucking work that weighs a team down, then shape a practical AI or software pilot with people still in control. At any point, I can help turn what we discuss into an inquiry for Conneen AI. To start, what should I call you, and what does your business do? Share only what you're comfortable sharing.";

let baseUrl = DEFAULT_BASE_URL;
let evalModel = "gpt-5-mini";
let maxTurns = 9;

async function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  let content = "";

  try {
    content = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key]) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Set it before running the evaluator.`);
  return value;
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function uniqueSuffix() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function stripLeadPaneMarker(text) {
  return String(text || "").replaceAll("[[OPEN_LEAD_PANE]]", "").trim();
}

function transcriptToText(messages) {
  return messages
    .map((message) => {
      const speaker = message.role === "assistant" ? "Scout" : "Prospect";
      return `${speaker}: ${message.content}`;
    })
    .join("\n\n");
}

async function createResponseText(client, options) {
  const response = await client.responses.create(options);
  return response.output_text?.trim() || "";
}

async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `${url} returned HTTP ${res.status}`);
  }
  return { data, res };
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `${url} returned HTTP ${res.status}`);
  }
  return data;
}

async function ensureBackendReachable() {
  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 400) return;
    if (res.status === 500 && data.error) {
      throw new Error(`Scout backend is reachable but returned: ${data.error}`);
    }
    throw new Error(`Scout backend returned an unexpected HTTP ${res.status}.`);
  } catch (error) {
    if (error instanceof Error && !error.message.includes("fetch failed")) throw error;
    throw new Error(
      `Could not reach Scout backend at ${baseUrl}/api/chat.\nStart the local site in another terminal with: npm run dev`
    );
  }
}

function makeScenario(credentials) {
  return `
Name: Priya Nair
Email: ${credentials.email}
Business: Northstar Family Dental, a three-location dental practice with 34 employees in Anchorage and the Mat-Su area.
Problem: Front desk and billing staff are buried in insurance verification, no-show recovery, treatment-plan follow-up, and claim attachment prep. The owner wants fewer dropped patients, faster verification, and cleaner handoffs before expanding to a fourth location.
Current process: Dentrix for scheduling/patient records, Outlook shared inboxes, payer portals, phone calls, spreadsheets for unscheduled treatment, PDF scans for claim attachments, and manual end-of-day call lists.
Constraints: HIPAA-sensitive data, patients must not receive automated clinical advice, staff must approve messages, payer portals are inconsistent, budget exists but the first pilot needs to be narrow and conservative.
Buying posture: Serious but cautious. Priya wants a practical pilot and a portal workspace she can inspect before agreeing to anything larger.
Goal for the conversation: Get Scout to understand enough context to create a substantial pre-meeting account/workspace with workflows, process summaries, pain point summaries, project scope, milestones, a conservative draft quote/estimate, an initial meeting, tasks/work items, data requests, system access needs, user stories, goals, metrics, risks, open questions, and setup tour steps.
Communication style: Direct, busy, plainspoken, reasonably organized, skeptical of AI hype, asks practical questions.
Tech comfort: Comfortable with dental systems and spreadsheets, not technical about APIs or model details.
Time pressure: Wants a pilot outline this week because the office manager is training two new front desk employees.
What Priya knows at first: High-level pain, systems used, staffing impact, and rough goals.
What Priya will only reveal if asked: Exact tools, approval points, compliance concerns, data examples available, success metrics, budget sensitivity, timeline, and what should be in the portal account.
`;
}

async function createProspectReply(client, scenario, messages, turnNumber) {
  const transcript = transcriptToText(messages);
  return createResponseText(client, {
    model: evalModel,
    reasoning: { effort: "low" },
    instructions: `
You are impersonating Priya Nair, a prospective client talking to Scout.
You are trying to get a useful Conneen AI workspace/account created from the conversation.

Private scenario:
${scenario}

Rules:
- Stay in character as Priya.
- Do not mention that this is a simulation, test, script, prompt, or evaluation.
- Give Scout real business details gradually, but make sure the account can be richly populated by the end.
- Sound like a busy owner/operator, not a consultant.
- Keep most replies under 95 words.
- If Scout asks what happens next or offers to draft an inquiry, ask it to write it up and create/send the workspace.
- By turn 4 or later, explicitly provide the email and ask for a portal/workspace to be created.
- Mention the kinds of setup artifacts Priya wants only naturally: milestones, a rough quote/estimate, initial meeting, tasks/work items, data request checklist, user stories, open questions, metrics, risks, and pilot outline.
- If Scout sounds ready to send the inquiry, say you want the portal/account created with those items already set up so you can inspect it before the meeting.
`,
    input: `Conversation so far:\n\n${transcript}\n\nWrite Priya's turn ${turnNumber} reply only.`,
  });
}

async function callScout(messages) {
  const { data } = await postJson(`${baseUrl}/api/chat`, {
    messages,
    visitorFirstName: "",
  });
  const raw = data.reply || "";
  return {
    reply: stripLeadPaneMarker(raw),
    openedLeadPane: String(raw).includes("[[OPEN_LEAD_PANE]]"),
  };
}

async function draftLead(messages) {
  const { data } = await postJson(`${baseUrl}/api/lead-draft`, { messages });
  return data;
}

async function submitLead({ credentials, draft, messages }) {
  const workflow =
    draft.workflow ||
    "Priya Nair at Northstar Family Dental needs a narrow AI/software pilot for insurance verification, no-show recovery, treatment-plan follow-up, and claim attachment prep with human approval and HIPAA-aware workflows.";

  const { data } = await postJson(`${baseUrl}/api/leads`, {
    name: draft.name || "Priya Nair",
    email: credentials.email,
    company: draft.company || "Northstar Family Dental",
    phone: "907-555-0184",
    workflow,
    source: "scout_account_provision_eval",
    pagePath: "/eval/scout-account-creation",
    messages,
  });
  return data;
}

function extractInviteToken(inviteUrl) {
  if (!inviteUrl) return "";
  const url = new URL(inviteUrl);
  return url.searchParams.get("invite") || "";
}

function sessionCookieFromResponse(res) {
  const setCookie = res.headers.get("set-cookie") || "";
  const [cookie] = setCookie.split(";");
  return cookie || "";
}

async function acceptInvite({ credentials, inviteUrl }) {
  const token = extractInviteToken(inviteUrl);
  if (!token) throw new Error(`Provisioning did not return an accept-invite URL. Received: ${inviteUrl || "none"}`);

  const { data, res } = await postJson(`${baseUrl}/api/portal/accept-invite`, {
    token,
    email: credentials.email,
    displayName: "Priya Nair",
    password: credentials.password,
  });

  const cookie = sessionCookieFromResponse(res);
  if (!cookie) throw new Error("Accepted invite, but the portal did not return a session cookie.");
  return { data, cookie };
}

async function fetchPortalInventory(cookie, clientId) {
  const headers = { Cookie: cookie };
  const dashboard = await getJson(`${baseUrl}/api/portal/dashboard?clientId=${encodeURIComponent(clientId)}`, headers);
  const sections = [
    "projects",
    "milestones",
    "estimates",
    "payments",
    "calendar_events",
    "tasks",
    "requirements",
    "business_knowledge",
    "workflows",
    "data_requests",
    "system_access",
    "business_goals",
    "success_metrics",
    "risks",
    "open_questions",
    "tour_steps",
    "scout_transcripts",
  ];

  const records = {};
  for (const section of sections) {
    records[section] = await getJson(
      `${baseUrl}/api/portal/records/${section}?clientId=${encodeURIComponent(clientId)}`,
      headers
    ).catch((error) => ({ rows: [], error: error.message }));
  }

  return { dashboard, records };
}

function summarizeInventory(inventory) {
  const counts = Object.fromEntries(
    Object.entries(inventory.records).map(([section, data]) => [section, data.rows?.length || 0])
  );
  const dashboard = inventory.dashboard;
  return {
    counts,
    dashboardCounts: {
      projects: dashboard.projects?.length || 0,
      documents: dashboard.documents?.length || 0,
      tasks: dashboard.tasks?.length || 0,
      tourSteps: dashboard.tourSteps?.length || 0,
      goals: dashboard.goals?.length || 0,
      metrics: dashboard.metrics?.length || 0,
      meetings: counts.calendar_events || 0,
      milestones: counts.milestones || 0,
      estimates: counts.estimates || 0,
    },
    sampleTasks: (inventory.records.tasks.rows || []).slice(0, 6).map((task) => ({
      title: task.title,
      type: task.task_type,
      status: task.status,
      assigned_to: task.assigned_to,
      due_date: task.due_date,
    })),
    sampleProjects: (inventory.records.projects.rows || []).slice(0, 3).map((project) => ({
      name: project.name,
      stage: project.agile_stage,
      scope: project.scope,
    })),
    warnings: Object.entries(inventory.records)
      .filter(([, data]) => data.error)
      .map(([section, data]) => `${section}: ${data.error}`),
  };
}

async function gradeRun(client, scenario, messages, draft, leadResult, inventorySummary) {
  return createResponseText(client, {
    model: evalModel,
    reasoning: { effort: "low" },
    instructions: `
You are grading a Scout account-creation evaluation.
Grade Scout and the resulting portal provisioning, not the simulated prospect.

Use numeric scores from 1 to 10 where 10 is excellent.
Include:
1. Overall score
2. Category score table for: discovery, business empathy, workflow diagnosis, conversion/account readiness, portal population quality, specificity of tasks/data requests, safety/compliance awareness, pricing discipline, and conversation pacing
3. Whether the resulting account appears inspectable and substantially pre-populated
4. What Scout did well
5. Missing information Scout should have collected
6. Highest-priority fixes to improve account creation
`,
    input: `
Scenario:
${scenario}

Transcript:
${transcriptToText(messages)}

Lead draft:
${JSON.stringify(draft, null, 2)}

Lead/provisioning result:
${JSON.stringify(leadResult, null, 2)}

Portal inventory summary:
${JSON.stringify(inventorySummary, null, 2)}
`,
  });
}

async function main() {
  await loadLocalEnv();
  requireEnv("OPENAI_API_KEY");

  baseUrl = (process.env.SCOUT_ACCOUNT_EVAL_BASE_URL || process.env.SCOUT_EVAL_BASE_URL || baseUrl).replace(/\/$/, "");
  evalModel = process.env.OPENAI_EVAL_MODEL || process.env.OPENAI_MODEL || evalModel;
  maxTurns = Number.parseInt(process.env.SCOUT_ACCOUNT_EVAL_TURNS || String(maxTurns), 10);

  await ensureBackendReachable();
  await fs.mkdir(OUT_DIR, { recursive: true });

  const suffix = uniqueSuffix();
  const credentials = {
    email: `scout.provision.${suffix}@example.com`,
    password: `ScoutProvision-${suffix}!`,
  };
  const scenario = makeScenario(credentials);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const messages = [{ role: "assistant", content: SCOUT_OPENING }];

  console.log(`Running Scout account-creation evaluation against ${baseUrl}`);
  console.log(`Using evaluator model: ${evalModel}`);
  console.log(`Test username: ${credentials.email}`);
  console.log(`Generated password: ${credentials.password}`);
  if (process.env.PORTAL_PROVISION_WITH_AI === "false") {
    console.log("Note: local .env sets PORTAL_PROVISION_WITH_AI=false. The server will use fallback provisioning instead of AI-rich provisioning.");
  }

  let leadPaneOpened = false;
  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const prospectReply = await createProspectReply(client, scenario, messages, turn);
    messages.push({ role: "user", content: prospectReply });
    console.log(`Prospect ${turn}: ${prospectReply}`);

    const scout = await callScout(messages);
    leadPaneOpened = leadPaneOpened || scout.openedLeadPane;
    messages.push({ role: "assistant", content: scout.reply });
    console.log(`Scout ${turn}: ${scout.reply}`);

    if (leadPaneOpened && /write it up|send it|workspace|portal|account/i.test(prospectReply)) {
      break;
    }
  }

  const draft = await draftLead(messages);
  const leadResult = await submitLead({ credentials, draft, messages });
  const provision = leadResult.portalProvision || {};
  const inviteUrl = provision.inviteUrl || "";
  const accepted = await acceptInvite({ credentials, inviteUrl });
  const clientId = provision.clientId || accepted.data.user?.client_id;
  if (!clientId) throw new Error("Could not determine the provisioned client ID.");

  const inventory = await fetchPortalInventory(accepted.cookie, clientId);
  const inventorySummary = summarizeInventory(inventory);
  const grade = await gradeRun(client, scenario, messages, draft, leadResult, inventorySummary);

  const report = [
    "# Scout Account Creation Evaluation Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Backend: ${baseUrl}`,
    `Model: ${evalModel}`,
    `Max prospect turns: ${maxTurns}`,
    `Lead pane opened during conversation: ${leadPaneOpened ? "yes" : "no"}`,
    "",
    "## Portal Login For Manual Inspection",
    "",
    `Portal URL: ${baseUrl}/portal`,
    `Username: ${credentials.email}`,
    `Password: ${credentials.password}`,
    `Client ID: ${clientId}`,
    `Project ID: ${provision.projectId || "Not returned"}`,
    `Invite URL used: ${inviteUrl || "Not returned"}`,
    "",
    "## Fixed Prospect Scenario",
    "",
    scenario.trim(),
    "",
    "## Transcript",
    "",
    transcriptToText(messages),
    "",
    "## Lead Draft Submitted",
    "",
    "```json",
    JSON.stringify(draft, null, 2),
    "```",
    "",
    "## Provisioning Result",
    "",
    "```json",
    JSON.stringify(leadResult, null, 2),
    "```",
    "",
    "## Portal Inventory Summary",
    "",
    "```json",
    JSON.stringify(inventorySummary, null, 2),
    "```",
    "",
    "## Scout Grade And Recommendations",
    "",
    grade,
    "",
  ].join("\n");

  const reportPath = path.join(OUT_DIR, `scout-account-eval-${timestampForFile()}.md`);
  await fs.writeFile(reportPath, report, "utf8");

  console.log("");
  console.log(`Saved report: ${reportPath}`);
  console.log(`Portal URL: ${baseUrl}/portal`);
  console.log(`Username: ${credentials.email}`);
  console.log(`Password: ${credentials.password}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
