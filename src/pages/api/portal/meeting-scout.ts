import OpenAI from "openai";
import crypto from "node:crypto";
import type { APIRoute } from "astro";
import { authenticateRequest, canAccessClient } from "../../../lib/portal/auth";
import { getClientContext } from "../../../lib/portal/ai";
import { getEnv } from "../../../lib/portal/env";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { eq, selectRows, updateRows } from "../../../lib/portal/supabase";

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

function isMeetingSecretOk(request: Request) {
  const webhookSecret = getEnv("SCOUT_MEETING_WEBHOOK_SECRET");
  const providedSecret = request.headers.get("x-scout-meeting-secret") || "";
  const providedSecretHash = request.headers.get("x-scout-meeting-secret-hash") || "";
  return Boolean(
    webhookSecret
    && (providedSecret === webhookSecret || providedSecretHash === fingerprint(webhookSecret))
  );
}

function transcriptText(lines: TranscriptLine[]) {
  return lines
    .slice(-120)
    .map((line) => `${line.speaker || "Speaker"}: ${line.text}`)
    .join("\n")
    .slice(-24000);
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

    const transcript = Array.isArray(event.scout_live_transcript) ? event.scout_live_transcript : [];
    const responses = Array.isArray(event.scout_live_responses) ? event.scout_live_responses : [];
    const action = cleanText(body.action, 80) || "append_transcript";
    const nextTranscript: TranscriptLine[] = transcript.slice(-180);
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
    const updated = await updateRows<any>(
      "portal_calendar_events",
      { id: eq(eventId), client_id: eq(clientId) },
      {
        scout_meeting_status: action === "finalize" ? "complete" : "live_notes",
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

    return jsonResponse({ event: updated[0] || null, scout: scoutOutput });
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
