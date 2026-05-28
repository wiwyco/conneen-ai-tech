import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";

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
  throw new Error("No client workspace found. Create one or set PORTAL_MEETING_TEST_CLIENT_ID.");
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

function openUrl(url) {
  if (process.env.SCOUT_VOICE_TEST_OPEN_ZOOM === "false") return;
  const platform = os.platform();
  if (platform === "win32") {
    childProcess.spawn(
      "powershell",
      ["-NoProfile", "-Command", "Start-Process -FilePath $args[0]", url],
      { detached: true, stdio: "ignore", windowsHide: true }
    ).unref();
    return;
  }
  if (platform === "darwin") {
    childProcess.spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  childProcess.spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function buildScoutBotUrl(event, client) {
  const secret = requireEnv("SCOUT_MEETING_WEBHOOK_SECRET");
  requireEnv("ZOOM_MEETING_SDK_CLIENT_ID", "ZOOM_MEETING_SDK_KEY");
  requireEnv("ZOOM_MEETING_SDK_CLIENT_SECRET", "ZOOM_MEETING_SDK_SECRET");

  const meetingNumber = String(event.meeting_provider_id || "").replace(/\s/g, "");
  if (!meetingNumber) throw new Error("Scheduled Zoom event did not include a Zoom meeting id.");

  const params = new URLSearchParams({
    eventId: event.id,
    clientId: client.id,
    meetingNumber,
    password: event.meeting_password || "",
    secret,
    secretHash: crypto.createHash("sha256").update(secret).digest("hex").slice(0, 10),
    name: process.env.ZOOM_BOT_NAME || "Scout",
    autoJoin: process.env.SCOUT_ZOOM_BOT_AUTO_JOIN || "true",
    chatEcho: process.env.SCOUT_ZOOM_BOT_CHAT_ECHO || "true",
    sdkVersion: process.env.SCOUT_ZOOM_BOT_SDK_VERSION || "4.0.0",
    voice: process.env.SCOUT_TTS_VOICE || "marin",
    pollScout: process.env.SCOUT_ZOOM_BOT_POLL_SCOUT || "true",
  });

  return `${baseUrl}/zoom-scout-bot?${params.toString()}`;
}

function speakWindows(text) {
  return new Promise((resolve) => {
    const escaped = String(text || "").replaceAll("'", "''");
    const command = [
      "Add-Type -AssemblyName System.Speech",
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      "$s.Rate = 1",
      `$s.Speak('${escaped}')`,
    ].join("; ");
    const child = childProcess.spawn("powershell", ["-NoProfile", "-Command", command], {
      windowsHide: true,
      stdio: "ignore",
    });
    child.on("close", resolve);
    child.on("error", resolve);
  });
}

async function speak(text) {
  if (process.env.SCOUT_VOICE_TEST_SPEAK === "false") return;
  if (os.platform() === "win32") {
    await speakWindows(text);
    return;
  }
  console.log("(Speech output is currently implemented for Windows PowerShell TTS.)");
}

function parseSpeakerLine(line) {
  const index = line.indexOf(":");
  if (index === -1) return { speaker: "Meeting participant", text: line.trim() };
  return {
    speaker: line.slice(0, index).trim() || "Meeting participant",
    text: line.slice(index + 1).trim(),
  };
}

async function scheduleMeeting(client, cookie) {
  const calendar = await getJson(`/api/portal/calendar?clientId=${encodeURIComponent(client.id)}`, cookie);
  const slot = findFreeSlot(calendar.busySlots || []);
  const title = `Scout voice assistant test ${new Date().toLocaleTimeString()}`;
  const scheduled = await postJson(
    "/api/portal/calendar",
    {
      clientId: client.id,
      title,
      eventAt: slot.toISOString(),
      durationMinutes: 60,
      notes: "Live test for Scout as a meeting voice assistant.",
    },
    cookie
  );
  return scheduled.data.event;
}

async function sendTranscript({ event, client, cookie, speaker, text }) {
  const updated = await postJson(
    "/api/portal/meeting-scout",
    {
      action: "append_transcript",
      eventId: event.id,
      clientId: client.id,
      speaker,
      text,
    },
    cookie
  );
  return updated.data;
}

async function runScriptedDemo({ event, client, cookie, log }) {
  const lines = [
    "Maria Torres: Listen up, Scout. What should we confirm before we decide the pilot is ready?",
    "Winslow Conneen: Put that in the meeting chat as a checklist, Scout.",
    "Maria Torres: Can you explain the HIPAA-sensitive parts out loud too?",
    "Winslow Conneen: That's enough, Scout.",
  ];

  let currentEvent = event;
  for (const line of lines) {
    const parsed = parseSpeakerLine(line);
    console.log(`\n${parsed.speaker}: ${parsed.text}`);
    const data = await sendTranscript({ event: currentEvent, client, cookie, ...parsed });
    currentEvent = data.event || currentEvent;
    log.push({ speaker: parsed.speaker, text: parsed.text, scout: data.scout });
    await handleScoutOutput(data.scout);
  }
  return currentEvent;
}

async function handleScoutOutput(scout) {
  if (!scout) return;
  if (scout.stopRequested) {
    console.log("\n[Scout stopped]");
    return;
  }
  if (!scout.shouldRespond || !scout.response) return;

  if (scout.delivery === "chat") {
    console.log(`\n[Scout -> MEETING CHAT]\n${scout.response}`);
    return;
  }

  console.log(`\n[Scout -> VOICE]\n${scout.response}`);
  await speak(scout.response);
}

async function runInteractive({ event, client, cookie, log }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let currentEvent = event;

  console.log("\nScout voice assistant is ready.");
  console.log('Type transcript lines like: Maria Torres: listen up, Scout, what should we do next?');
  console.log('Use: Winslow Conneen: put that in the meeting chat');
  console.log('Use: Maria Torres: that\'s enough, Scout');
  console.log("Type /demo to run sample lines, or /quit to end.\n");

  try {
    while (true) {
      const line = (await rl.question("> ")).trim();
      if (!line) continue;
      if (line === "/quit") break;
      if (line === "/demo") {
        currentEvent = await runScriptedDemo({ event: currentEvent, client, cookie, log });
        continue;
      }

      const parsed = parseSpeakerLine(line);
      const data = await sendTranscript({ event: currentEvent, client, cookie, ...parsed });
      currentEvent = data.event || currentEvent;
      log.push({ speaker: parsed.speaker, text: parsed.text, scout: data.scout });
      await handleScoutOutput(data.scout);
    }
  } finally {
    rl.close();
  }

  return currentEvent;
}

async function run() {
  await loadLocalEnv();
  baseUrl = (process.env.PORTAL_MEETING_TEST_BASE_URL || process.env.PORTAL_TEST_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  await ensureBackendReachable();

  const session = await login();
  const me = await getJson("/api/portal/me", session.cookie);
  const client = await pickClient(me, session.cookie);
  const event = await scheduleMeeting(client, session.cookie);
  const joinUrl = event.meeting_url || event.location || "";

  if (event.meeting_provider !== "zoom" || !/^https?:\/\//i.test(joinUrl)) {
    throw new Error(
      `A Zoom meeting link was not created. Provider was "${event.meeting_provider || "unknown"}". ` +
      "Confirm Zoom OAuth is working with npm run test:zoom-oauth and run with MEETING_PROVIDER_REQUIRED=true for exact API errors."
    );
  }

  console.log(`Created Zoom meeting: ${event.title}`);
  console.log(`Client: ${client.name || client.id}`);
  console.log(`Join URL: ${joinUrl}`);
  const scoutBotUrl = buildScoutBotUrl(event, client);
  console.log(`Scout bot URL: ${scoutBotUrl.replace(/([?&]secret=)[^&]+/, "$1[hidden]")}`);
  openUrl(joinUrl);
  openUrl(scoutBotUrl);

  const log = [];
  const mode = process.env.SCOUT_VOICE_TEST_MODE || "interactive";
  const finalEvent = mode === "scripted"
    ? await runScriptedDemo({ event, client, cookie: session.cookie, log })
    : await runInteractive({ event, client, cookie: session.cookie, log });

  const report = `# Zoom Scout Voice Assistant Test - ${new Date().toISOString()}

## Meeting

- Client: ${client.name || client.id}
- Meeting ID: ${event.id}
- Provider: ${event.meeting_provider}
- Join URL: ${joinUrl}
- Scout bot opened: ${process.env.SCOUT_VOICE_TEST_OPEN_ZOOM === "false" ? "no" : "yes"}
- Scout bot page: ${scoutBotUrl.replace(/([?&]secret=)[^&]+/, "$1[hidden]")}
- Scout latest response delivery: ${finalEvent.scout_response_delivery || "none"}
- Scout response count: ${Array.isArray(finalEvent.scout_live_responses) ? finalEvent.scout_live_responses.length : 0}

## Visible Bot Notes

The browser bot page joins the Zoom meeting as Scout using the Zoom Meeting SDK. Zoom chat events are relayed into Scout's meeting brain when the SDK exposes chat events in this browser build. Scout can post chat responses back when the SDK exposes sendChat.

Browser text-to-speech plays locally from the bot page. To make that audio audible inside Zoom, route the browser output into a virtual microphone device and select that device as Scout's microphone in the bot meeting window.

## Test Log

${log.map((item) => `### ${item.speaker}\n\n${item.text}\n\n${item.scout?.response ? `Scout (${item.scout.delivery}): ${item.scout.response}` : item.scout?.stopRequested ? "Scout stopped." : "Scout did not respond."}`).join("\n\n")}
`;

  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `zoom-scout-voice-test-${timestampForFile()}.md`);
  await fs.writeFile(outPath, report, "utf8");
  console.log(`\nSaved report: ${outPath}`);
}

run().catch((error) => {
  console.error(`Zoom Scout voice assistant test failed: ${error.message}`);
  process.exitCode = 1;
});
