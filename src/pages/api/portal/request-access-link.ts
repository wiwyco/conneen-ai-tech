import type { APIRoute } from "astro";
import { createToken, hashToken, findUserByEmail } from "../../../lib/portal/auth";
import { getPublicBaseUrl } from "../../../lib/portal/env";
import { jsonResponse, readJson } from "../../../lib/portal/http";
import { insertRow } from "../../../lib/portal/supabase";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const user = await findUserByEmail(body.email);
    if (!user) return jsonResponse({ ok: true, message: "If the account exists, an access link can be sent." });

    const token = createToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 20).toISOString();
    const mode = body.mode === "reset" ? "reset" : "magic";
    const table = mode === "reset" ? "portal_password_resets" : "portal_magic_links";
    await insertRow(table, {
      user_id: user.id,
      token_hash: hashToken(token),
      expires_at: expiresAt,
    });

    return jsonResponse({
      ok: true,
      message: "Access link created. Wire this into email delivery when ready.",
      accessUrl: `${getPublicBaseUrl().replace(/\/$/, "")}/portal?${mode}=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not create access link." }, 500);
  }
};
