import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { authenticateRequest } from "../../../lib/portal/auth";
import { getEnv } from "../../../lib/portal/env";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { SCOUT_VOICE_OPTIONS, synthesizeScoutSpeech } from "../../../lib/portal/scoutVoice";

export const prerender = false;

function fingerprint(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}

export const GET: APIRoute = async () => {
  return jsonResponse({
    model: getEnv("SCOUT_TTS_MODEL") || "gpt-4o-mini-tts",
    defaultVoice: getEnv("SCOUT_TTS_VOICE") || "marin",
    voices: SCOUT_VOICE_OPTIONS,
  });
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await authenticateRequest(request);
    const webhookSecret = getEnv("SCOUT_MEETING_WEBHOOK_SECRET");
    const providedSecret = request.headers.get("x-scout-meeting-secret") || "";
    const providedSecretHash = request.headers.get("x-scout-meeting-secret-hash") || "";
    const secretOk = Boolean(
      webhookSecret
      && (providedSecret === webhookSecret || providedSecretHash === fingerprint(webhookSecret))
    );
    if (!auth && !secretOk) return jsonResponse({ error: "Authentication required." }, 401);

    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const text = cleanText(body.text, 4000);
    const voice = cleanText(body.voice, 40) || undefined;
    const requestedFormat = cleanText(body.format, 20);
    const format = requestedFormat === "pcm" || requestedFormat === "mp3" || requestedFormat === "opus" ? requestedFormat : "wav";
    if (!text) return jsonResponse({ error: "Speech text is required." }, 400);

    const audio = await synthesizeScoutSpeech({ text, voice, format });
    return new Response(audio.buffer, {
      status: 200,
      headers: {
        "Content-Type": audio.contentType,
        "X-Scout-Voice": audio.selected.id,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not synthesize Scout voice." }, 500);
  }
};
