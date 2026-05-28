import crypto from "node:crypto";
import type { APIRoute } from "astro";
import { getEnv } from "../../../lib/portal/env";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";

export const prerender = false;

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fingerprint(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function signMeetingSdkJwt({
  sdkKey,
  sdkSecret,
  meetingNumber,
  role,
}: {
  sdkKey: string;
  sdkSecret: string;
  meetingNumber: string;
  role: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sdkKey,
    appKey: sdkKey,
    mn: meetingNumber,
    role,
    iat: now - 30,
    exp: now + 60 * 60 * 2,
    tokenExp: now + 60 * 60 * 2,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac("sha256", sdkSecret).update(unsigned).digest();
  return `${unsigned}.${base64Url(signature)}`;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const webhookSecret = getEnv("SCOUT_MEETING_WEBHOOK_SECRET");
    const providedSecret = request.headers.get("x-scout-meeting-secret") || "";
    const providedSecretHash = request.headers.get("x-scout-meeting-secret-hash") || "";
    if (!webhookSecret) {
      return jsonResponse({ error: "Server is missing SCOUT_MEETING_WEBHOOK_SECRET. Restart the dev server after adding it to .env." }, 500);
    }
    if (!providedSecret && !providedSecretHash) {
      return jsonResponse({ error: "Scout meeting secret header is required." }, 401);
    }
    const serverSecretFingerprint = fingerprint(webhookSecret);
    if (providedSecret !== webhookSecret && providedSecretHash !== serverSecretFingerprint) {
      return jsonResponse({
        error: "Scout meeting secret mismatch. The bot URL secret does not match the dev server environment.",
        providedSecretFingerprint: providedSecret ? fingerprint(providedSecret) : "",
        providedSecretHash,
        serverSecretFingerprint,
      }, 401);
    }

    const sdkKey = getEnv("ZOOM_MEETING_SDK_CLIENT_ID") || getEnv("ZOOM_MEETING_SDK_KEY");
    const sdkSecret = getEnv("ZOOM_MEETING_SDK_CLIENT_SECRET") || getEnv("ZOOM_MEETING_SDK_SECRET");
    if (!sdkKey || !sdkSecret) {
      return jsonResponse({ error: "Missing Zoom Meeting SDK credentials." }, 500);
    }

    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const meetingNumber = cleanText(body.meetingNumber, 80).replace(/\s/g, "");
    const role = Number(body.role) === 1 ? 1 : 0;
    if (!meetingNumber) return jsonResponse({ error: "Meeting number is required." }, 400);

    return jsonResponse({
      sdkKey,
      signature: signMeetingSdkJwt({ sdkKey, sdkSecret, meetingNumber, role }),
      botName: getEnv("ZOOM_BOT_NAME") || "Scout",
      role,
      scoutSecretFingerprint: serverSecretFingerprint,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not create Zoom SDK signature." }, 500);
  }
};
