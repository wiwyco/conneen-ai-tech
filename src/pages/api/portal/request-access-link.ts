import type { APIRoute } from "astro";
import { createToken, hashToken, findUserByEmail } from "../../../lib/portal/auth";
import { cleanEmail, jsonResponse, readJson } from "../../../lib/portal/http";
import { enforceRateLimit, RATE_LIMITS } from "../../../lib/portal/rate-limit";
import { buildPortalUrl, secretLinkPayload, sendPortalLinkEmail, shouldReturnSecretLinks } from "../../../lib/portal/secret-links";
import { insertRow } from "../../../lib/portal/supabase";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const email = cleanEmail(body.email);
    const limited = await enforceRateLimit({
      request,
      route: "portal_access_link",
      subject: email,
      ...RATE_LIMITS.accessLink,
    });
    if (limited) return limited;
    const user = await findUserByEmail(email);
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
    const accessUrl = buildPortalUrl({ [mode]: token, email: user.email });
    const accessEmailSent = await sendPortalLinkEmail({
      clientId: user.client_id,
      userId: user.id,
      to: user.email,
      subject: mode === "reset" ? "Reset your Conneen AI portal password" : "Your Conneen AI portal login link",
      heading: mode === "reset" ? "Reset your portal password" : "Log in to your portal",
      intro: mode === "reset"
        ? "Use this link to set a new password. It expires soon."
        : "Use this link to log in to your Conneen AI portal. It expires soon.",
      linkText: mode === "reset" ? "Reset password" : "Log in",
      url: accessUrl,
    });

    return jsonResponse(secretLinkPayload("accessUrl", accessUrl, {
      ok: true,
      accessEmailSent,
      message: accessEmailSent
        ? "If the account exists, an access link has been sent."
        : shouldReturnSecretLinks()
          ? "Access link created. Email delivery is not configured, so the local link is shown."
          : "If the account exists, an access link can be sent. Email delivery is not configured.",
    }));
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not create access link." }, 500);
  }
};
