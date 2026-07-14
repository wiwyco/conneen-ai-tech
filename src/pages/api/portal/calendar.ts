import type { APIRoute } from "astro";
import { canAccessClient, requirePortalAuth } from "../../../lib/portal/auth";
import { logAudit, logTimeline } from "../../../lib/portal/activity";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { createOnlineMeeting } from "../../../lib/portal/meetingProvider";
import { canPortalAction, filterReadableRecords, loadPortalAccessContext } from "../../../lib/portal/permissions";
import { insertRow, order, selectRows } from "../../../lib/portal/supabase";

export const prerender = false;

const ALASKA_TIME_ZONE = "America/Anchorage";
const START_HOUR = 14;
const END_HOUR = 21;

function alaskaParts(date: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ALASKA_TIME_ZONE,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
}

function isWithinAvailability(date: Date, durationMinutes: number) {
  const parts = alaskaParts(date);
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const startMinutes = hour * 60 + minute;
  const endMinutes = startMinutes + durationMinutes;
  return startMinutes >= START_HOUR * 60 && endMinutes <= END_HOUR * 60;
}

function overlaps(start: Date, durationMinutes: number, existing: any) {
  const startMs = start.getTime();
  const endMs = startMs + durationMinutes * 60_000;
  const existingStart = new Date(existing.event_at).getTime();
  const existingEnd = existingStart + Number(existing.duration_minutes || 60) * 60_000;
  return startMs < existingEnd && existingStart < endMs;
}

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const auth = await requirePortalAuth(request);
    const clientId = cleanText(url.searchParams.get("clientId"), 80) || auth.clientId || "";
    if (!clientId) return jsonResponse({ error: "Client id is required." }, 400);
    if (!canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);

    const rows = await selectRows<any>("portal_calendar_events", {
      select: "id,client_id,project_id,title,event_at,duration_minutes,event_type,location,meeting_provider,meeting_provider_id,meeting_url,meeting_password,meeting_join_instructions,scout_meeting_status,scout_live_transcript,scout_meeting_notes,scout_key_takeaways,scout_draft_deliverables,scout_live_responses,scout_is_addressed,scout_response_delivery,scout_latest_response,scout_latest_response_at,scout_stop_requested_at,scout_last_summary_at,notes,visibility,created_at",
      event_at: `gte.${new Date().toISOString()}`,
      order: order("event_at", true),
      limit: 500,
    });

    const access = await loadPortalAccessContext(auth, clientId);
    const readableEvents = await filterReadableRecords(
      auth,
      "calendar_events",
      clientId,
      rows.filter((event) => auth.isAdmin || event.client_id === clientId),
      access
    );
    const visibleEvents = readableEvents
      .map((event) => ({
        id: event.id,
        client_id: event.client_id,
        project_id: event.project_id,
        title: event.title,
        event_at: event.event_at,
        duration_minutes: event.duration_minutes || 60,
        event_type: event.event_type,
        location: event.location,
        meeting_provider: event.meeting_provider,
        meeting_provider_id: event.meeting_provider_id,
        meeting_url: event.meeting_url,
        meeting_password: auth.isAdmin ? event.meeting_password : event.meeting_password ? "set" : "",
        meeting_join_instructions: event.meeting_join_instructions,
        scout_meeting_status: event.scout_meeting_status,
        scout_live_transcript: event.scout_live_transcript,
        scout_meeting_notes: event.scout_meeting_notes,
        scout_key_takeaways: event.scout_key_takeaways,
        scout_draft_deliverables: event.scout_draft_deliverables,
        scout_live_responses: event.scout_live_responses,
        scout_is_addressed: event.scout_is_addressed,
        scout_response_delivery: event.scout_response_delivery,
        scout_latest_response: event.scout_latest_response,
        scout_latest_response_at: event.scout_latest_response_at,
        scout_stop_requested_at: event.scout_stop_requested_at,
        scout_last_summary_at: event.scout_last_summary_at,
        notes: event.notes,
        visibility: event.visibility,
      }));

    const busySlots = rows.map((event) => ({
      event_at: event.event_at,
      duration_minutes: event.duration_minutes || 60,
    }));

    return jsonResponse({ events: visibleEvents, busySlots });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not load calendar." }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const clientId = cleanText(body.clientId, 80) || auth.clientId || "";
    if (!clientId) return jsonResponse({ error: "Client id is required." }, 400);
    if (!canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);
    if (!await canPortalAction(auth, { section: "calendar_events", action: "create", clientId, projectId: cleanText(body.project_id, 80), visibility: "shared" })) {
      return jsonResponse({ error: "Forbidden." }, 403);
    }

    const eventAt = cleanText(body.eventAt, 80);
    const start = new Date(eventAt);
    const durationMinutes = Math.min(Math.max(Number(body.durationMinutes || 60), 15), 180);
    if (!eventAt || Number.isNaN(start.getTime())) return jsonResponse({ error: "Meeting time is required." }, 400);
    if (start.getTime() <= Date.now()) return jsonResponse({ error: "Meeting time must be in the future." }, 400);
    if (!isWithinAvailability(start, durationMinutes)) {
      return jsonResponse({ error: "Meetings must be Monday-Friday between 2:00 PM and 9:00 PM Alaska time." }, 400);
    }

    const existing = await selectRows<any>("portal_calendar_events", {
      select: "id,event_at,duration_minutes",
      event_at: `gte.${new Date(start.getTime() - 3 * 60 * 60_000).toISOString()}`,
      order: order("event_at", true),
      limit: 200,
    });
    if (existing.some((event) => overlaps(start, durationMinutes, event))) {
      return jsonResponse({ error: "That meeting time is already booked." }, 409);
    }

    const title = cleanText(body.title, 160) || "Project meeting";
    const notes = cleanText(body.notes, 4000);
    const onlineMeeting = await createOnlineMeeting({
      title,
      startTime: start.toISOString(),
      durationMinutes,
      notes,
    });

    const row = await insertRow<any>("portal_calendar_events", {
      client_id: clientId,
      project_id: cleanText(body.project_id, 80) || null,
      title,
      event_at: start.toISOString(),
      duration_minutes: durationMinutes,
      event_type: "meeting",
      location: onlineMeeting.joinUrl || "Online",
      meeting_provider: onlineMeeting.provider,
      meeting_provider_id: onlineMeeting.providerId,
      meeting_url: onlineMeeting.joinUrl,
      meeting_password: onlineMeeting.password,
      meeting_join_instructions: onlineMeeting.instructions,
      scout_meeting_status: "scheduled",
      notes,
      visibility: "shared",
    });

    await logAudit(auth, "create", "portal_calendar_events", row.id, clientId);
    await logTimeline(clientId, `Meeting scheduled: ${row.title}`, {
      auth,
      eventType: "meeting_scheduled",
      sourceTable: "portal_calendar_events",
      sourceId: row.id,
      description: `Scheduled for ${row.event_at}${row.meeting_url ? " with an online meeting link" : ""}`,
      visibility: "shared",
    });

    return jsonResponse({ event: row });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not schedule meeting." }, 500);
  }
};
