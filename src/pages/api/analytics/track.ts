import type { APIRoute } from "astro";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { logStructuredEvent } from "../../../lib/portal/logging";
import { recordWebsiteAnalyticsEvent, type WebsiteAnalyticsEventType } from "../../../lib/portal/websiteAnalytics";

export const prerender = false;

const EVENT_TYPES = new Set<WebsiteAnalyticsEventType>(["page_view", "chat_message", "lead_submission", "client_error"]);

export const POST: APIRoute = async ({ request }) => {
  const body = (await readJson<Record<string, unknown>>(request)) || {};
  const eventType = cleanText(body.eventType, 80) as WebsiteAnalyticsEventType;

  if (!EVENT_TYPES.has(eventType)) {
    return jsonResponse({ error: "Unsupported analytics event." }, 400);
  }

  if (eventType === "client_error") {
    const metadata = typeof body.metadata === "object" && body.metadata ? body.metadata as Record<string, unknown> : {};
    await logStructuredEvent(request, {
      level: "warn",
      area: cleanText(metadata.area, 120) || "client_error",
      route: cleanText(body.pagePath, 500) || null,
      message: cleanText(metadata.message, 1000) || "Client-side error",
      metadata: {
        source: cleanText(body.source, 80) || "public_site",
        ...metadata,
      },
    });
    return jsonResponse({ ok: true });
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
