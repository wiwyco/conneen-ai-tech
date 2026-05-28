import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_PORT = 8787;
const OUTBOX_DIR = path.resolve(process.cwd(), "scout-audio-outbox");

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
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (!key || process.env[key]) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

function zoomValidationResponse(plainToken) {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || "";
  return {
    plainToken,
    encryptedToken: crypto.createHmac("sha256", secret).update(plainToken).digest("hex"),
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function postScoutTranscript({ eventId, clientId, speaker, text }) {
  const baseUrl = (process.env.SCOUT_RTMS_PORTAL_BASE_URL || process.env.PORTAL_MEETING_TEST_BASE_URL || "http://localhost:4321").replace(/\/$/, "");
  const secret = process.env.SCOUT_MEETING_WEBHOOK_SECRET || "";
  if (!eventId || !clientId) {
    console.log(`[Scout RTMS] Transcript from ${speaker}: ${text}`);
    console.log("[Scout RTMS] Set SCOUT_RTMS_EVENT_ID and SCOUT_RTMS_CLIENT_ID to post this transcript into the portal meeting brain.");
    return;
  }

  const response = await fetch(`${baseUrl}/api/portal/meeting-scout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-scout-meeting-secret": secret,
    },
    body: JSON.stringify({
      action: "append_transcript",
      eventId,
      clientId,
      speaker,
      text,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Scout meeting endpoint failed with HTTP ${response.status}`);
  if (data.scout?.shouldRespond && data.scout?.response) {
    await enqueueScoutSpeech(data.scout.response, data.scout.delivery || "voice");
  }
}

async function enqueueScoutSpeech(text, delivery) {
  if (delivery === "chat") {
    console.log(`[Scout RTMS] Chat response requested: ${text}`);
    return;
  }

  await fs.mkdir(OUTBOX_DIR, { recursive: true });
  const fileName = `scout-response-${Date.now()}.json`;
  await fs.writeFile(
    path.join(OUTBOX_DIR, fileName),
    JSON.stringify({
      text,
      voice: process.env.SCOUT_TTS_VOICE || "marin",
      model: process.env.SCOUT_TTS_MODEL || "gpt-4o-mini-tts",
      createdAt: new Date().toISOString(),
      note: "Native Zoom Meeting SDK audio sender should synthesize this text and inject PCM/WAV into Scout's Zoom microphone.",
    }, null, 2),
    "utf8"
  );
  console.log(`[Scout RTMS] Queued Scout speech for native audio bridge: ${fileName}`);
}

async function startRtms(payload) {
  let rtms;
  try {
    rtms = (await import("@zoom/rtms")).default;
  } catch (error) {
    console.error("[Scout RTMS] @zoom/rtms is not installed or not supported on this OS.");
    console.error("[Scout RTMS] Zoom currently supports the RTMS SDK package on Linux/macOS, not Windows.");
    console.error("[Scout RTMS] Install and run this listener on Ubuntu/macOS: npm install @zoom/rtms");
    throw error;
  }

  const client = new rtms.Client();
  const eventId = process.env.SCOUT_RTMS_EVENT_ID || "";
  const clientId = process.env.SCOUT_RTMS_CLIENT_ID || "";

  client.onTranscriptData((data, _size, _timestamp, metadata = {}) => {
    const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data || "");
    const speaker = metadata.userName || metadata.user_name || metadata.userId || "Zoom participant";
    if (!text.trim()) return;
    postScoutTranscript({ eventId, clientId, speaker: String(speaker), text }).catch((error) => {
      console.error(`[Scout RTMS] Could not post transcript: ${error.message}`);
    });
  });

  client.onAudioData((data, timestamp, metadata = {}) => {
    const speaker = metadata.userName || metadata.user_name || metadata.userId || "Zoom participant";
    console.log(`[Scout RTMS] Audio packet ${data.length} bytes from ${speaker} at ${timestamp}`);
  });

  client.onLeave?.((reason) => {
    console.log(`[Scout RTMS] Left RTMS stream: ${reason}`);
  });

  client.join(payload);
  console.log("[Scout RTMS] Joining stream.");
}

async function handleRequest(request, response) {
  try {
    if (request.method !== "POST") {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("Scout RTMS listener is running.");
      return;
    }

    const body = await readBody(request);
    if (body.event === "endpoint.url_validation" && body.payload?.plainToken) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(zoomValidationResponse(body.payload.plainToken)));
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));

    if (body.event === "meeting.rtms_started") {
      await startRtms(body.payload || {});
    } else if (body.event) {
      console.log(`[Scout RTMS] Ignored webhook event: ${body.event}`);
    }
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "RTMS listener failed" }));
  }
}

async function run() {
  await loadLocalEnv();
  const port = Number(process.env.SCOUT_RTMS_PORT || DEFAULT_PORT);
  http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    });
  }).listen(port, () => {
    console.log(`[Scout RTMS] Webhook listener running on http://localhost:${port}`);
    console.log("[Scout RTMS] Expose this URL publicly for Zoom webhooks, for example with ngrok.");
  });
}

run().catch((error) => {
  console.error(`[Scout RTMS] Failed to start: ${error.message}`);
  process.exitCode = 1;
});
