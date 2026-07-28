import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const buildRoot = path.join(root, ".test-build", String(process.pid));
const srcRoot = path.join(root, "src");

process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
process.env.PUBLIC_SITE_URL = "https://example.test";
process.env.PORTAL_RETURN_SECRET_LINKS = "false";
delete process.env.OPENAI_API_KEY;
delete process.env.RESEND_API_KEY;

const db = {};
const storageUploads = [];
let idCounter = 1;

const adminToken = "admin-session";
const clientToken = "client-session";
const adminUser = {
  id: "admin-user",
  client_id: null,
  email: "admin@example.test",
  display_name: "Admin",
  role: "admin",
};
const clientUser = {
  id: "client-user",
  client_id: "client-1",
  email: "client@example.test",
  display_name: "Client Owner",
  role: "client_owner",
};

function id(prefix) {
  return `${prefix}-${idCounter++}`;
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function resetDb() {
  idCounter = 1;
  storageUploads.length = 0;
  for (const key of Object.keys(db)) delete db[key];
  Object.assign(db, {
    portal_sessions: [
      { id: "session-admin", user_id: adminUser.id, token_hash: tokenHash(adminToken), expires_at: "2999-01-01T00:00:00.000Z", revoked_at: null },
      { id: "session-client", user_id: clientUser.id, token_hash: tokenHash(clientToken), expires_at: "2999-01-01T00:00:00.000Z", revoked_at: null },
    ],
    portal_users: [adminUser, clientUser],
    portal_permission_groups: [{ id: "client-owner-group", role_key: "client_owner" }],
    portal_permission_group_members: [],
    portal_access_policies: [
      { id: "policy-decisions-read", group_id: "client-owner-group", section: "decisions", action: "read", visibility: "shared", allowed: true },
      { id: "policy-doc-upload", group_id: "client-owner-group", section: "documents", action: "upload_document", visibility: "shared", allowed: true },
      { id: "policy-task-form", group_id: "client-owner-group", section: "tasks", action: "complete_form", visibility: "shared", allowed: true },
      { id: "policy-task-upload", group_id: "client-owner-group", section: "tasks", action: "upload_document", visibility: "shared", allowed: true },
    ],
    portal_record_access: [],
    portal_clients: [{ id: "client-1", name: "Client Co" }],
    portal_decisions: [],
    portal_tasks: [],
    portal_ai_memories: [],
    portal_documents: [],
    portal_document_versions: [],
    portal_timeline_events: [],
    portal_audit_logs: [],
    portal_email_events: [],
    app_error_events: [],
    portal_scout_transcripts: [],
    portal_contacts: [],
    portal_business_knowledge: [],
    portal_workflows: [],
    portal_projects: [],
    portal_milestones: [],
    portal_estimates: [],
    portal_payments: [],
    portal_invoices: [],
    portal_contracts: [],
    portal_requirements: [],
    portal_data_requests: [],
    portal_system_access: [],
    portal_business_goals: [],
    portal_success_metrics: [],
    portal_risks: [],
    portal_open_questions: [],
    portal_calendar_events: [],
    portal_handover_items: [],
    portal_meetings: [],
    portal_training_materials: [],
    portal_change_requests: [],
    portal_notifications: [],
    portal_tour_steps: [],
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseFilter(value) {
  const raw = String(value || "");
  const dot = raw.indexOf(".");
  return dot === -1 ? { op: "", value: raw } : { op: raw.slice(0, dot), value: raw.slice(dot + 1) };
}

function matches(row, key, value) {
  if (["select", "order", "limit", "or"].includes(key)) return true;
  const filter = parseFilter(value);
  if (filter.op === "eq") return String(row[key] ?? "") === filter.value;
  if (filter.op === "is") return filter.value === "null" ? row[key] == null : true;
  if (filter.op === "in") {
    const values = filter.value.replace(/^\(|\)$/g, "").split(",");
    return values.includes(String(row[key] ?? ""));
  }
  if (filter.op === "gte") return String(row[key] ?? "") >= filter.value;
  return true;
}

function tableFromRestUrl(url) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/\/rest\/v1\/([^/]+)/);
  return match?.[1] || "";
}

async function mockRestFetch(url, init = {}) {
  const parsed = new URL(url);
  if (parsed.pathname.startsWith("/storage/v1/object/sign/")) {
    return Response.json({ signedURL: "/object/signature" });
  }
  if (parsed.pathname.startsWith("/storage/v1/object/")) {
    storageUploads.push({ url, init });
    return new Response("", { status: 200 });
  }

  const table = tableFromRestUrl(url);
  if (!table) return new Response("Not found", { status: 404 });
  db[table] ||= [];
  const method = (init.method || "GET").toUpperCase();

  if (method === "GET") {
    let rows = db[table].filter((row) => [...parsed.searchParams.entries()].every(([key, value]) => matches(row, key, value)));
    const limit = Number(parsed.searchParams.get("limit") || 0);
    if (limit) rows = rows.slice(0, limit);
    return Response.json(clone(rows));
  }

  if (method === "POST") {
    const payload = JSON.parse(init.body || "{}");
    const row = { id: payload.id || id(table), created_at: new Date().toISOString(), ...payload };
    db[table].push(row);
    return Response.json([clone(row)]);
  }

  if (method === "PATCH") {
    const payload = JSON.parse(init.body || "{}");
    const updated = [];
    for (const row of db[table]) {
      if ([...parsed.searchParams.entries()].every(([key, value]) => matches(row, key, value))) {
        Object.assign(row, payload);
        updated.push(clone(row));
      }
    }
    return Response.json(updated);
  }

  return new Response("", { status: 204 });
}

globalThis.fetch = mockRestFetch;

async function transpileFile(sourcePath) {
  const relative = path.relative(srcRoot, sourcePath);
  const outputPath = path.join(buildRoot, relative).replace(/\.ts$/, ".js");
  const source = await fs.readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
    },
  }).outputText
    .replace(/import\.meta\.env/g, "process.env")
    .replace(/from\s+["'](\.{1,2}\/[^"']+?)["']/g, (match, specifier) => {
      if (specifier.endsWith(".js") || specifier.endsWith(".json")) return match;
      return match.replace(specifier, `${specifier}.js`);
    });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, compiled, "utf8");
}

async function transpileSrc(dir = srcRoot) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await transpileSrc(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      await transpileFile(fullPath);
    }
  }
}

async function importBuilt(relativePath) {
  return import(pathToFileURL(path.join(buildRoot, relativePath)).href);
}

function jsonRequest(body, token = adminToken) {
  return new Request("https://example.test/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `conneen_portal_session=${encodeURIComponent(token)}`,
    },
    body: JSON.stringify(body),
  });
}

function formRequest(form, token = clientToken) {
  return new Request("https://example.test/api", {
    method: "POST",
    headers: { Cookie: `conneen_portal_session=${encodeURIComponent(token)}` },
    body: form,
  });
}

async function responseJson(response) {
  return response.json();
}

await fs.rm(buildRoot, { recursive: true, force: true });
await transpileSrc();

test.beforeEach(() => {
  resetDb();
});

test("auth permissions hide pending/internal records and block client task creation", async () => {
  const recordsRoute = await importBuilt("pages/api/portal/records/[section].js");
  db.portal_decisions.push(
    { id: "decision-ok", client_id: "client-1", title: "Approved", decision: "Ship it", visibility: "shared", review_required: false, review_status: "approved" },
    { id: "decision-pending", client_id: "client-1", title: "Pending", decision: "Maybe", visibility: "shared", review_required: true, review_status: "pending_review" },
    { id: "decision-internal", client_id: "client-1", title: "Internal", decision: "Nope", visibility: "internal", review_required: false, review_status: "approved" }
  );

  const getResponse = await recordsRoute.GET({
    request: new Request("https://example.test/api/portal/records/decisions?clientId=client-1", {
      headers: { Cookie: `conneen_portal_session=${clientToken}` },
    }),
    params: { section: "decisions" },
    url: new URL("https://example.test/api/portal/records/decisions?clientId=client-1"),
  });
  const data = await responseJson(getResponse);
  assert.equal(getResponse.status, 200);
  assert.deepEqual(data.rows.map((row) => row.id), ["decision-ok"]);

  const postResponse = await recordsRoute.POST({
    request: jsonRequest({ client_id: "client-1", title: "Client task" }, clientToken),
    params: { section: "tasks" },
  });
  assert.equal(postResponse.status, 403);
});

test("lead provisioning creates review-gated generated portal records", async () => {
  const { provisionPortalFromLead } = await importBuilt("lib/portal/provisioning.js");
  const result = await provisionPortalFromLead({
    id: "lead-1",
    name: "Ada",
    email: "ada@example.test",
    company: "Ada Co",
    workflow_type: "Intake",
    workflow_summary: "We need help with intake follow-up.",
    transcript: [{ role: "user", content: "We need a first workflow pilot." }],
  });

  assert.ok(result.clientId);
  assert.equal(db.portal_estimates.length, 1);
  assert.equal(db.portal_estimates[0].visibility, "internal");
  assert.equal(db.portal_estimates[0].review_required, true);
  assert.equal(db.portal_estimates[0].generated_by, "lead_provisioning");
});

test("meeting transcript processing is idempotent and source-tracked", async () => {
  const meetingRoute = await importBuilt("pages/api/portal/meeting-scout.js");
  db.portal_calendar_events.push({
    id: "meeting-1",
    client_id: "client-1",
    project_id: "project-1",
    title: "Discovery",
    event_at: "2026-07-27T20:00:00.000Z",
    visibility: "shared",
    scout_meeting_status: "scheduled",
    scout_live_transcript: [],
    scout_live_responses: [],
  });

  const body = {
    eventId: "meeting-1",
    clientId: "client-1",
    action: "process_transcript",
    fullTranscript: "Winslow: We should create a follow-up task.\nClient: Approved, but confirm pricing later.",
  };
  const first = await responseJson(await meetingRoute.POST({ request: jsonRequest(body), params: {} }));
  assert.equal(first.event.scout_meeting_status, "complete");
  assert.equal(db.portal_meetings.length, 1);
  assert.equal(db.portal_timeline_events.length, 1);
  assert.equal(db.portal_meetings[0].source_record_id, "meeting-1");
  assert.equal(db.portal_meetings[0].generated_by, "meeting_scout");
  assert.ok(db.portal_meetings[0].source_hash);

  const second = await responseJson(await meetingRoute.POST({ request: jsonRequest({ ...body, force: true }), params: {} }));
  assert.match(second.warnings[0], /already been processed/i);
  assert.equal(db.portal_meetings.length, 1);
  assert.equal(db.portal_timeline_events.length, 1);
});

test("task forms complete once and save customer answers into AI memory", async () => {
  const taskFormsRoute = await importBuilt("pages/api/portal/task-forms.js");
  db.portal_tasks.push({
    id: "task-form-1",
    client_id: "client-1",
    project_id: "project-1",
    title: "Confirm workflow",
    task_type: "customer_questions",
    status: "todo",
    visibility: "shared",
    assigned_to: clientUser.id,
    form_schema: { fields: [{ name: "current_process", label: "Current process", required: true }] },
  });

  const response = await taskFormsRoute.POST({
    request: jsonRequest({
      clientId: "client-1",
      taskId: "task-form-1",
      answers: { current_process: "Inbox to spreadsheet." },
    }, clientToken),
  });
  const data = await responseJson(response);
  assert.equal(response.status, 200);
  assert.equal(data.task.status, "complete");
  assert.equal(db.portal_ai_memories.length, 1);
  assert.match(db.portal_ai_memories[0].content, /Inbox to spreadsheet/);

  const duplicate = await taskFormsRoute.POST({
    request: jsonRequest({
      clientId: "client-1",
      taskId: "task-form-1",
      answers: { current_process: "Again" },
    }, clientToken),
  });
  assert.equal(duplicate.status, 409);
});

test("uploads enforce file policy and create document records", async () => {
  const uploadRoute = await importBuilt("pages/api/portal/upload.js");
  const form = new FormData();
  form.set("clientId", "client-1");
  form.set("title", "Discovery Notes");
  form.set("category", "notes");
  form.set("file", new File(["hello"], "notes.txt", { type: "text/plain" }));

  const response = await uploadRoute.POST({ request: formRequest(form, clientToken) });
  const data = await responseJson(response);
  assert.equal(response.status, 200);
  assert.equal(data.document.title, "Discovery Notes");
  assert.equal(db.portal_documents.length, 1);
  assert.equal(db.portal_document_versions.length, 1);
  assert.equal(storageUploads.length, 1);

  const badForm = new FormData();
  badForm.set("clientId", "client-1");
  badForm.set("file", new File(["bad"], "bad.exe", { type: "application/x-msdownload" }));
  const badResponse = await uploadRoute.POST({ request: formRequest(badForm, clientToken) });
  assert.equal(badResponse.status, 415);
});

test("client error tracking writes structured error events", async () => {
  const trackRoute = await importBuilt("pages/api/analytics/track.js");
  const response = await trackRoute.POST({
    request: jsonRequest({
      eventType: "client_error",
      source: "client_portal",
      pagePath: "/portal",
      metadata: {
        area: "portal_api",
        message: "GET /api/portal/dashboard failed",
        status: 500,
      },
    }, clientToken),
  });

  assert.equal(response.status, 200);
  assert.equal(db.app_error_events.length, 1);
  assert.equal(db.app_error_events[0].level, "warn");
  assert.equal(db.app_error_events[0].area, "portal_api");
  assert.match(db.app_error_events[0].message, /dashboard failed/);
});
