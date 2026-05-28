import type { APIRoute } from "astro";
import { hashPassword, hashToken } from "../../../lib/portal/auth";
import { cleanEmail, cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { eq, selectOne, updateRows } from "../../../lib/portal/supabase";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const token = cleanText(body.token, 500);
    const email = cleanEmail(body.email);
    const password = cleanText(body.password, 300);
    if (!token || !email || password.length < 12) {
      return jsonResponse({ error: "Token, email, and a 12+ character password are required." }, 400);
    }

    const reset = await selectOne<any>("portal_password_resets", {
      token_hash: eq(hashToken(token)),
      used_at: "is.null",
    });
    if (!reset || new Date(reset.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "Invalid or expired reset link." }, 400);
    }

    const user = await selectOne<any>("portal_users", { id: eq(reset.user_id), email: eq(email) });
    if (!user) return jsonResponse({ error: "Reset link does not match this email." }, 400);

    await updateRows("portal_users", { id: eq(user.id) }, {
      password_hash: await hashPassword(password),
      updated_at: new Date().toISOString(),
    });
    await updateRows("portal_password_resets", { id: eq(reset.id) }, { used_at: new Date().toISOString() });

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Password reset failed." }, 500);
  }
};
