import { getEnv } from "./env";

type CaptchaResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; status: number; error: string };

type TurnstileResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function getTurnstileSecret(): string | undefined {
  return getEnv("TURNSTILE_SECRET_KEY") || getEnv("CF_TURNSTILE_SECRET_KEY");
}

function getClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || null;

  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-client-ip")
  );
}

export function isLeadCaptchaRequired(): boolean {
  return Boolean(getTurnstileSecret());
}

export async function verifyLeadCaptcha({
  token,
  request,
}: {
  token: string | null;
  request: Request;
}): Promise<CaptchaResult> {
  const secret = getTurnstileSecret();
  if (!secret) return { ok: true, skipped: true };

  if (!token) {
    return {
      ok: false,
      status: 400,
      error: "Please complete the verification challenge before sending the brief.",
    };
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);

  const ip = getClientIp(request);
  if (ip) form.set("remoteip", ip);

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });

    const data = (await response.json().catch(() => ({}))) as TurnstileResponse;

    if (!response.ok || !data.success) {
      return {
        ok: false,
        status: 400,
        error: "The verification challenge did not pass. Please try again.",
      };
    }

    return { ok: true };
  } catch (error) {
    console.error("Turnstile verification failed:", error);
    return {
      ok: false,
      status: 503,
      error: "Verification is temporarily unavailable. Please try again in a moment.",
    };
  }
}
