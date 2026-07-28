import crypto from "node:crypto";
import type { PortalAuth } from "./auth";
import { cleanText } from "./http";
import { insertRow } from "./supabase";

export type StructuredLogLevel = "info" | "warn" | "error";

type LogEventInput = {
  level?: StructuredLogLevel;
  area: string;
  route?: string;
  message: string;
  error?: unknown;
  auth?: PortalAuth | null;
  clientId?: string | null;
  metadata?: Record<string, unknown>;
};

function firstHeader(request: Request | null | undefined, names: string[]) {
  if (!request) return "";
  for (const name of names) {
    const value = cleanText(request.headers.get(name), 160);
    if (value) return value;
  }
  return "";
}

function clientIp(request: Request | null | undefined) {
  if (!request) return "";
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

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { error_name: null, error_message: cleanText(String(error || ""), 1000) || null };
  }
  return {
    error_name: error.name,
    error_message: cleanText(error.message, 1000),
    error_stack: cleanText(error.stack, 4000) || null,
  };
}

export async function logStructuredEvent(request: Request | null | undefined, input: LogEventInput) {
  const details = errorDetails(input.error);
  const payload = {
    level: input.level || "error",
    area: cleanText(input.area, 120),
    route: cleanText(input.route || request?.url, 500) || null,
    message: cleanText(input.message || details.error_message, 1000) || "Application event",
    client_id: input.clientId || input.auth?.clientId || null,
    user_id: input.auth?.user.id || null,
    user_role: input.auth?.user.role || null,
    country: firstHeader(request, ["x-vercel-ip-country", "cf-ipcountry"]) || null,
    region: firstHeader(request, ["x-vercel-ip-country-region", "x-vercel-ip-region"]) || null,
    city: firstHeader(request, ["x-vercel-ip-city"]) || null,
    ip_hash: hashIp(clientIp(request)),
    user_agent: cleanText(request?.headers.get("user-agent"), 800) || null,
    metadata: input.metadata || {},
    ...details,
  };

  const consolePayload = {
    ...payload,
    error_stack: payload.error_stack ? "[captured]" : null,
  };
  const writer = payload.level === "error" ? console.error : payload.level === "warn" ? console.warn : console.info;
  writer(JSON.stringify(consolePayload));

  await insertRow("app_error_events", payload).catch((logError) => {
    console.warn("Structured log insert skipped:", logError);
  });
}

export async function logErrorEvent(
  request: Request | null | undefined,
  input: Omit<LogEventInput, "level"> & { level?: StructuredLogLevel }
) {
  await logStructuredEvent(request, { level: "error", ...input });
}
