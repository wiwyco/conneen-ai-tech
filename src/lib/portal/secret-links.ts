import { getEnv, getPublicBaseUrl } from "./env";
import { insertRow } from "./supabase";

const EMAIL_TIMEOUT_MS = 12_000;

export function isProductionPortal() {
  return getEnv("NODE_ENV") === "production" || getEnv("VERCEL_ENV") === "production";
}

export function shouldReturnSecretLinks() {
  const explicit = getEnv("PORTAL_RETURN_SECRET_LINKS");
  if (explicit) return explicit.toLowerCase() === "true";
  return !isProductionPortal();
}

export function buildPortalUrl(params: Record<string, string>) {
  const url = new URL("/portal", getPublicBaseUrl().replace(/\/$/, ""));
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function secretLinkPayload(key: string, url: string, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    linkReturned: shouldReturnSecretLinks(),
    ...(shouldReturnSecretLinks() ? { [key]: url } : {}),
  };
}

export async function sendPortalLinkEmail({
  clientId,
  userId,
  to,
  subject,
  heading,
  intro,
  linkText,
  url,
}: {
  clientId?: string | null;
  userId?: string | null;
  to: string;
  subject: string;
  heading: string;
  intro: string;
  linkText: string;
  url: string;
}) {
  const resendApiKey = getEnv("RESEND_API_KEY");
  const from = getEnv("LEAD_FROM_EMAIL");
  const baseEvent = {
    client_id: clientId || null,
    user_id: userId || null,
    email_to: to,
    subject,
  };

  if (!resendApiKey || !from) {
    await insertRow("portal_email_events", {
      ...baseEvent,
      status: "skipped",
      provider_response: { reason: "missing_email_provider" },
    }).catch(() => null);
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
            <h2>${escapeHtml(heading)}</h2>
            <p>${escapeHtml(intro)}</p>
            <p><a href="${escapeHtml(url)}">${escapeHtml(linkText)}</a></p>
            <p>If the button does not work, paste this link into your browser:<br>${escapeHtml(url)}</p>
          </div>
        `,
      }),
    });

    const responseText = await response.text().catch(() => "");
    await insertRow("portal_email_events", {
      ...baseEvent,
      status: response.ok ? "sent" : "failed",
      provider_response: {
        status: response.status,
        body: response.ok ? responseText.slice(0, 500) : responseText.slice(0, 1000),
      },
    }).catch(() => null);

    if (!response.ok) {
      console.error("Portal link email failed:", response.status, responseText);
      return false;
    }
    return true;
  } catch (error) {
    await insertRow("portal_email_events", {
      ...baseEvent,
      status: "failed",
      provider_response: { error: error instanceof Error ? error.message : "Unknown email error" },
    }).catch(() => null);
    console.error("Portal link email failed:", error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
