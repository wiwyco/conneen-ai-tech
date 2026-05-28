import type { APIRoute } from "astro";
import { createSession, findUserByEmail, sessionCookie, verifyPassword } from "../../../lib/portal/auth";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const user = await findUserByEmail(body?.email);
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
