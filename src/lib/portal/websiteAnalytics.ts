import crypto from "node:crypto";
import { cleanText } from "./http";
import { insertRow, selectRows } from "./supabase";

export type WebsiteAnalyticsEventType = "page_view" | "chat_message" | "lead_submission" | "client_error";

type TrackEventInput = {
  eventType: WebsiteAnalyticsEventType;
  source?: unknown;
  pagePath?: unknown;
  referrer?: unknown;
  visitorId?: unknown;
  sessionId?: unknown;
  metadata?: Record<string, unknown>;
};

function firstHeader(request: Request, names: string[]): string {
  for (const name of names) {
    const value = cleanText(request.headers.get(name), 160);
    if (value) return value;
  }
  return "";
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    forwarded.split(",")[0]?.trim() ||
    ""
  );
}

function hashIp(ip: string) {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex");
}

export async function recordWebsiteAnalyticsEvent(request: Request, input: TrackEventInput): Promise<boolean> {
  const eventType = input.eventType;
  const visitorId = cleanText(input.visitorId, 120);
  const sessionId = cleanText(input.sessionId, 120);

  try {
    await insertRow("website_analytics_events", {
      event_type: eventType,
      source: cleanText(input.source, 80) || null,
      page_path: cleanText(input.pagePath, 500) || null,
      referrer: cleanText(input.referrer || request.headers.get("referer"), 800) || null,
      visitor_id: visitorId || null,
      session_id: sessionId || null,
      country: firstHeader(request, ["x-vercel-ip-country", "cf-ipcountry"]) || null,
      region: firstHeader(request, ["x-vercel-ip-country-region", "x-vercel-ip-region"]) || null,
      city: firstHeader(request, ["x-vercel-ip-city"]) || null,
      ip_hash: hashIp(clientIp(request)),
      user_agent: cleanText(request.headers.get("user-agent"), 800) || null,
      metadata: input.metadata || {},
    });
    return true;
  } catch (error) {
    console.warn("Website analytics event skipped:", error);
    return false;
  }
}

function uniqueCount(rows: any[], field: string) {
  return new Set(rows.map((row) => cleanText(row[field], 180)).filter(Boolean)).size;
}

function groupCounts(rows: any[], field: string, fallback = "Unknown") {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = cleanText(row[field], 160) || fallback;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export async function getWebsiteUsageAnalytics(days = 30) {
  const safeDays = Math.min(365, Math.max(1, Math.round(days)));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  const [events, leads, errors] = await Promise.all([
    selectRows<any>("website_analytics_events", {
      select: "*",
      created_at: `gte.${since}`,
      order: "created_at.desc",
      limit: 5000,
    }).catch(() => []),
    selectRows<any>("diagnostic_leads", {
      select: "id,source,page_path,workflow_type,created_at",
      created_at: `gte.${since}`,
      order: "created_at.desc",
      limit: 1000,
    }).catch(() => []),
    selectRows<any>("app_error_events", {
      select: "id,level,area,route,message,error_name,error_message,client_id,user_role,country,region,city,metadata,created_at",
      created_at: `gte.${since}`,
      order: "created_at.desc",
      limit: 1000,
    }).catch(() => []),
  ]);

  const pageViews = events.filter((event) => event.event_type === "page_view");
  const chatMessages = events.filter((event) => event.event_type === "chat_message");
  const analyticsLeadEvents = events.filter((event) => event.event_type === "lead_submission");
  const leadRows = leads.length ? leads : analyticsLeadEvents;
  const chatbotLeads = leadRows.filter((lead) => (lead.source || "workflow_diagnostic") !== "site_contact_form");
  const websiteLeads = leadRows.filter((lead) => lead.source === "site_contact_form");
  const daysByKey = new Map<string, { date: string; pageViews: number; chatMessages: number; leads: number }>();

  for (let index = safeDays - 1; index >= 0; index--) {
    const date = new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    daysByKey.set(date, { date, pageViews: 0, chatMessages: 0, leads: 0 });
  }
  for (const event of pageViews) {
    const day = daysByKey.get(dayKey(event.created_at));
    if (day) day.pageViews++;
  }
  for (const event of chatMessages) {
    const day = daysByKey.get(dayKey(event.created_at));
    if (day) day.chatMessages++;
  }
  for (const lead of leadRows) {
    const day = daysByKey.get(dayKey(lead.created_at));
    if (day) day.leads++;
  }

  return {
    days: safeDays,
    since,
    counts: {
      pageViews: pageViews.length,
      uniqueVisitors: uniqueCount(pageViews, "visitor_id") || uniqueCount(events, "ip_hash"),
      chatbotSessions: uniqueCount(chatMessages, "session_id"),
      chatMessages: chatMessages.length,
      leads: leadRows.length,
      chatbotLeads: chatbotLeads.length,
      websiteLeads: websiteLeads.length,
      errors: errors.length,
      serverErrors: errors.filter((event) => event.level === "error").length,
      warnings: errors.filter((event) => event.level === "warn").length,
    },
    daily: [...daysByKey.values()],
    topPages: groupCounts(pageViews, "page_path").slice(0, 10),
    countries: groupCounts(pageViews, "country").slice(0, 10),
    regions: groupCounts(pageViews, "region").slice(0, 10),
    cities: groupCounts(pageViews, "city").slice(0, 10),
    leadSources: groupCounts(leadRows, "source", "workflow_diagnostic"),
    errorAreas: groupCounts(errors, "area").slice(0, 10),
    recentEvents: events.slice(0, 30),
    recentLeads: leadRows.slice(0, 20),
    recentErrors: errors.slice(0, 20),
  };
}
