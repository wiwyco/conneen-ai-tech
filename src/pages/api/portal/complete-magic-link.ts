import type { APIRoute } from "astro";
import { createSession, hashToken, sessionCookie } from "../../../lib/portal/auth";
import { cleanEmail, cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { eq, selectOne, updateRows } from "../../../lib/portal/supabase";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const token = cleanText(body.token, 500);
    const email = cleanEmail(body.email);
    if (!token || !email) return jsonResponse({ error: "Token and email are required." }, 400);

    const link = await selectOne<any>("portal_magic_links", {
      token_hash: eq(hashToken(token)),
      used_at: "is.null",
    });
    if (!link || new Date(link.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "Invalid or expired magic link." }, 400);
    }

    const user = await selectOne<any>("portal_users", { id: eq(link.user_id), email: eq(email), disabled_at: "is.null" });
    if (!user) return jsonResponse({ error: "Magic link does not match this email." }, 400);

    await updateRows("portal_magic_links", { id: eq(link.id) }, { used_at: new Date().toISOString() });
    const sessionToken = await createSession(user, request);

    return new Response(JSON.stringify({ ok: true, user: { ...user, password_hash: undefined } }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookie(sessionToken),
      },
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Magic link failed." }, 500);
  }
};
