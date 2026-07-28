import type { APIRoute } from "astro";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { recordWebsiteAnalyticsEvent, type WebsiteAnalyticsEventType } from "../../../lib/portal/websiteAnalytics";

export const prerender = false;

const EVENT_TYPES = new Set<WebsiteAnalyticsEventType>(["page_view", "chat_message", "lead_submission"]);

export const POST: APIRoute = async ({ request }) => {
  const body = (await readJson<Record<string, unknown>>(request)) || {};
  const eventType = cleanText(body.eventType, 80) as WebsiteAnalyticsEventType;

  if (!EVENT_TYPES.has(eventType)) {
    return jsonResponse({ error: "Unsupported analytics event." }, 400);
  }

  const ok = await recordWebsiteAnalyticsEvent(request, {
    eventType,
    source: body.source,
    pagePath: body.pagePath,
    referrer: body.referrer,
    visitorId: body.visitorId,
    sessionId: body.sessionId,
    metadata: typeof body.metadata === "object" && body.metadata ? body.metadata as Record<string, unknown> : {},
  });

  return jsonResponse({ ok });
};
