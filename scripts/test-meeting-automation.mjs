import fs from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "meeting-tests");
const DEFAULT_BASE_URL = "http://localhost:4321";

let baseUrl = DEFAULT_BASE_URL;

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

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function requireEnv(name, fallbackName = "") {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : "");
  if (!value) throw new Error(`Missing ${name}${fallbackName ? ` or ${fallbackName}` : ""}.`);
  return value;
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function cookieHeaderFrom(response) {
  const raw = response.headers.get("set-cookie") || "";
  return raw
    .split(/,(?=[^;,]+=)/)
    .map((part) => part.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function postJson(pathname, payload, cookie = "", headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `${pathname} returned HTTP ${response.status}`);
  }
  return { data, response };
}

async function getJson(pathname, cookie = "") {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `${pathname} returned HTTP ${response.status}`);
  }
  return data;
}

async function ensureBackendReachable() {
  try {
    const response = await fetch(`${baseUrl}/api/portal/me`);
    if (response.status === 401 || response.ok) return;
    throw new Error(`Portal returned HTTP ${response.status}.`);
  } catch (error) {
    if (error instanceof Error && !error.message.includes("fetch failed")) throw error;
    throw new Error(`Could not reach ${baseUrl}. Start the site in another terminal with: npm run dev`);
  }
}

async function login() {
  const email = requireEnv("PORTAL_MEETING_TEST_EMAIL", "PORTAL_TEST_EMAIL");
  const password = requireEnv("PORTAL_MEETING_TEST_PASSWORD", "PORTAL_TEST_PASSWORD");
  const { data, response } = await postJson("/api/portal/login", { email, password });
  const cookie = cookieHeaderFrom(response);
  if (!cookie) throw new Error("Login succeeded but no portal session cookie was returned.");
  return { user: data.user, cookie, email };
}

async function pickClient(me, cookie) {
  const explicitClientId = process.env.PORTAL_MEETING_TEST_CLIENT_ID || "";
  if (explicitClientId) return { id: explicitClientId, name: "Configured client" };

  if (!me.isAdmin) {
    if (!me.clientId) throw new Error("This login is not attached to a client workspace.");
    return { id: me.clientId, name: "Logged-in client workspace" };
  }

  const preferredName = (process.env.PORTAL_MEETING_TEST_CLIENT_NAME || "").toLowerCase();
  const clientsData = await getJson("/api/portal/clients", cookie);
  const clients = clientsData.clients || [];
  const preferred = preferredName
    ? clients.find((client) => String(client.name || "").toLowerCase().includes(preferredName))
    : null;
  if (preferred) return preferred;
  if (clients[0]) return clients[0];

  const created = await postJson(
    "/api/portal/clients",
    {
      name: "Meeting Automation Test Client",
      industry: "Test workspace",
      primary_contact_name: "Test Client",
      primary_contact_email: process.env.PORTAL_MEETING_TEST_EMAIL || process.env.PORTAL_TEST_EMAIL || "",
    },
    cookie
  );
  return created.data.client;
}

function alaskaParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Anchorage",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
}

function isAlaskaBusinessSlot(date) {
  const parts = alaskaParts(date);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return !["Sat", "Sun"].includes(parts.weekday) && minute === 0 && hour >= 14 && hour <= 20;
}

function overlaps(start, existing) {
  const startMs = start.getTime();
  const endMs = startMs + 60 * 60_000;
  const existingStart = new Date(existing.event_at).getTime();
  const existingEnd = existingStart + Number(existing.duration_minutes || 60) * 60_000;
  return startMs < existingEnd && existingStart < endMs;
}

function findFreeSlot(busySlots = []) {
  const start = new Date(Date.now() + 4 * 60 * 60_000);
  start.setUTCMinutes(0, 0, 0);

  for (let i = 0; i < 24 * 21; i += 1) {
    const candidate = new Date(start.getTime() + i * 60 * 60_000);
    if (candidate.getTime() <= Date.now()) continue;
    if (!isAlaskaBusinessSlot(candidate)) continue;
    if (!busySlots.some((event) => overlaps(candidate, event))) return candidate;
  }

  throw new Error("Could not find an available Alaska-time meeting slot in the next 21 days.");
}

async function run() {
  await loadLocalEnv();
  baseUrl = (process.env.PORTAL_MEETING_TEST_BASE_URL || process.env.PORTAL_TEST_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  await ensureBackendReachable();

  const session = await login();
  const me = await getJson("/api/portal/me", session.cookie);
  const client = await pickClient(me, session.cookie);
  const calendar = await getJson(`/api/portal/calendar?clientId=${encodeURIComponent(client.id)}`, session.cookie);
  const slot = findFreeSlot(calendar.busySlots || []);

  const title = `Scout meeting automation test ${new Date().toLocaleTimeString()}`;
  const scheduled = await postJson(
    "/api/portal/calendar",
    {
      clientId: client.id,
      title,
      eventAt: slot.toISOString(),
      durationMinutes: 60,
      notes: "Automated test meeting for online meeting creation and Scout live notes.",
    },
    session.cookie
  );
  const event = scheduled.data.event;

  const transcriptChunks = [
    {
      speaker: "Priya",
      text: "The main thing I want from this meeting is a simple pilot plan, a data checklist, and clear next steps for the front desk team.",
    },
    {
      speaker: "Winslow",
      text: "I will turn that into meeting notes, key takeaways, draft deliverables, and a short list of follow-up tasks before we wrap.",
    },
    {
      speaker: "Priya",
      text: "Please flag anything that needs HIPAA review, and keep the first deliverable limited to insurance verification and follow-up workflow mapping.",
    },
    {
      speaker: "Maria Torres",
      text: "Listen up, Scout. Based on what has been said so far, what should we confirm before the next meeting?",
    },
    {
      speaker: "Winslow Conneen",
      text: "Put that answer in the meeting chat too, Scout, with a concise checklist.",
    },
    {
      speaker: "Priya",
      text: "That's enough, Scout.",
    },
  ];

  let scoutEvent = event;
  for (const chunk of transcriptChunks) {
    const updated = await postJson(
      "/api/portal/meeting-scout",
      {
        action: "append_transcript",
        eventId: event.id,
        clientId: client.id,
        ...chunk,
      },
      session.cookie
    );
    scoutEvent = updated.data.event || scoutEvent;
  }

  const passed = Boolean(
    event.id
    && scoutEvent.scout_meeting_notes
    && scoutEvent.scout_key_takeaways
    && Array.isArray(scoutEvent.scout_live_responses)
    && scoutEvent.scout_live_responses.some((item) => item.status === "ready")
    && scoutEvent.scout_live_responses.some((item) => item.status === "stopped")
  );
  const zoomConfigured = event.meeting_provider === "zoom" && Boolean(event.meeting_url);
  const report = `# Meeting Automation Test - ${new Date().toISOString()}

## Result

- Passed: ${passed ? "yes" : "no"}
- Zoom link created: ${zoomConfigured ? "yes" : "no"}
- Provider: ${event.meeting_provider || "unknown"}
- Meeting ID: ${event.id}
- Client: ${client.name || client.id}
- Scheduled: ${event.event_at}
- Join URL: ${event.meeting_url || event.location || "none"}
- Provider instructions / fallback reason: ${event.meeting_join_instructions || "none"}
- Local test env sees MEETING_PROVIDER: ${process.env.MEETING_PROVIDER || "unset"}
- Local test env sees Zoom credentials: ${process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET ? "yes" : "no"}
- Scout latest response delivery: ${scoutEvent.scout_response_delivery || "none"}
- Scout addressed after stop phrase: ${scoutEvent.scout_is_addressed ? "yes" : "no"}
- Scout response count: ${Array.isArray(scoutEvent.scout_live_responses) ? scoutEvent.scout_live_responses.length : 0}

## Scout Notes

${scoutEvent.scout_meeting_notes || "No notes generated."}

## Key Takeaways

${scoutEvent.scout_key_takeaways || "No takeaways generated."}

## Draft Deliverables

${scoutEvent.scout_draft_deliverables || "No draft deliverables generated."}

## Live Scout Responses

${Array.isArray(scoutEvent.scout_live_responses) && scoutEvent.scout_live_responses.length
  ? scoutEvent.scout_live_responses.map((item) => `- ${item.delivery || "voice"} / ${item.status || "ready"} / ${item.requestedBy || "speaker"}: ${item.text || ""}`).join("\n")
  : "No live Scout responses generated."}

## Notes

If Zoom link created is "no", confirm these environment variables are set and restart the dev server:

- MEETING_PROVIDER=zoom
- ZOOM_ACCOUNT_ID
- ZOOM_CLIENT_ID
- ZOOM_CLIENT_SECRET
- ZOOM_USER_ID=me

For a one-time stricter diagnostic, set MEETING_PROVIDER_REQUIRED=true, restart the dev server, and run this test again. The schedule step will fail with Zoom's exact API error instead of falling back to manual.
`;

  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `meeting-test-${timestampForFile()}.md`);
  await fs.writeFile(outPath, report, "utf8");

  console.log(report);
  console.log(`\nSaved report: ${outPath}`);
}

run().catch((error) => {
  console.error(`Meeting automation test failed: ${error.message}`);
  process.exitCode = 1;
});
