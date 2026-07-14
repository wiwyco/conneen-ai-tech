import type { APIRoute } from "astro";
import { createSession, findUserByEmail, sessionCookie, verifyPassword } from "../../../lib/portal/auth";
import { cleanEmail, cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { enforceRateLimit, RATE_LIMITS } from "../../../lib/portal/rate-limit";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const email = cleanEmail(body?.email);
    const limited = await enforceRateLimit({
      request,
      route: "portal_login",
      subject: email,
      ...RATE_LIMITS.login,
    });
    if (limited) return limited;
    const user = await findUserByEmail(email);
    const password = cleanText(body?.password, 300);

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return jsonResponse({ error: "Invalid email or password." }, 401);
    }

    const token = await createSession(user, request);
    return new Response(JSON.stringify({ ok: true, user: { ...user, password_hash: undefined } }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookie(token),
      },
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Login failed." }, 500);
  }
};
