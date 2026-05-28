import type { APIRoute } from "astro";
import { createSession, hashPassword, hashToken, sessionCookie } from "../../../lib/portal/auth";
import { cleanEmail, cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { eq, selectOne, updateRows } from "../../../lib/portal/supabase";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const token = cleanText(body.token, 500);
    const email = cleanEmail(body.email);
    const password = cleanText(body.password, 300);
    const displayName = cleanText(body.displayName, 120);
    if (!token || !email || password.length < 12) return jsonResponse({ error: "Invite token, email, and 12+ character password are required." }, 400);

    const invite = await selectOne<any>("portal_invites", { token_hash: eq(hashToken(token)), accepted_at: "is.null" });
    if (!invite || new Date(invite.expires_at).getTime() < Date.now() || invite.email !== email) {
      return jsonResponse({ error: "Invalid or expired invite." }, 400);
    }

    const [user] = await updateRows<any>("portal_users", { email: eq(email) }, {
      display_name: displayName || email,
      password_hash: await hashPassword(password),
      accepted_invite_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await updateRows("portal_invites", { id: eq(invite.id) }, { accepted_at: new Date().toISOString() });
    const sessionToken = await createSession(user, request);

    return new Response(JSON.stringify({ ok: true, user: { ...user, password_hash: undefined } }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie(sessionToken) },
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not accept invite." }, 500);
  }
};
