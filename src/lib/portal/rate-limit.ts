import crypto from "node:crypto";
import { eq, insertRow, selectOne, updateRows } from "./supabase";

type RateLimitOptions = {
  request: Request;
  route: string;
  subject?: string | null;
  limit: number;
  windowSeconds: number;
  blockSeconds?: number;
};

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const firstForwarded = forwarded.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || firstForwarded
    || "unknown"
  );
}

function rateLimitResponse(retryAfterSeconds: number) {
  return new Response(JSON.stringify({
    error: "Too many requests. Please try again shortly.",
    retryAfterSeconds,
  }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))),
    },
  });
}

function secondsUntil(iso: string | null | undefined) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
}

export async function enforceRateLimit(options: RateLimitOptions): Promise<Response | null> {
  const ip = clientIp(options.request);
  const subject = String(options.subject || "").toLowerCase().slice(0, 320);
  const subjectHash = hash(`${ip}:${subject}`);
  const key = hash(`${options.route}:${subjectHash}`);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const windowMs = options.windowSeconds * 1000;

  try {
    const row = await selectOne<any>("portal_rate_limits", { key: eq(key) });
    const blockedFor = secondsUntil(row?.blocked_until);
    if (blockedFor > 0) return rateLimitResponse(blockedFor);

    if (!row) {
      await insertRow("portal_rate_limits", {
        key,
        route: options.route,
        subject_hash: subjectHash,
        window_start: nowIso,
        count: 1,
        last_seen_at: nowIso,
      });
      return null;
    }

    const windowStart = new Date(row.window_start).getTime();
    if (!Number.isFinite(windowStart) || now - windowStart >= windowMs) {
      await updateRows("portal_rate_limits", { key: eq(key) }, {
        window_start: nowIso,
        count: 1,
        blocked_until: null,
        last_seen_at: nowIso,
      });
      return null;
    }

    const nextCount = Number(row.count || 0) + 1;
    const windowEndsAt = windowStart + windowMs;
    if (nextCount > options.limit) {
      const blockedUntil = new Date(now + (options.blockSeconds || options.windowSeconds) * 1000).toISOString();
      await updateRows("portal_rate_limits", { key: eq(key) }, {
        count: nextCount,
        blocked_until: blockedUntil,
        last_seen_at: nowIso,
      });
      return rateLimitResponse(Math.max((windowEndsAt - now) / 1000, options.blockSeconds || options.windowSeconds));
    }

    await updateRows("portal_rate_limits", { key: eq(key) }, {
      count: nextCount,
      last_seen_at: nowIso,
    });
    return null;
  } catch (error) {
    console.warn(`Rate limit skipped for ${options.route}:`, error);
    return null;
  }
}

export const RATE_LIMITS = {
  login: { limit: 8, windowSeconds: 10 * 60, blockSeconds: 15 * 60 },
  accessLink: { limit: 4, windowSeconds: 15 * 60, blockSeconds: 30 * 60 },
  publicChat: { limit: 24, windowSeconds: 5 * 60, blockSeconds: 10 * 60 },
  lead: { limit: 5, windowSeconds: 60 * 60, blockSeconds: 60 * 60 },
  portalAi: { limit: 30, windowSeconds: 10 * 60, blockSeconds: 15 * 60 },
} as const;
