import type { APIRoute } from "astro";
import { createToken, hashPassword, hashToken, requirePortalAuth } from "../../../lib/portal/auth";
import { cleanEmail, cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { buildPortalUrl, secretLinkPayload, sendPortalLinkEmail, shouldReturnSecretLinks } from "../../../lib/portal/secret-links";
import { eq, insertRow, selectRows, updateRows } from "../../../lib/portal/supabase";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const auth = await requirePortalAuth(request);
    const clientId = cleanText(url.searchParams.get("clientId"), 80);
    if (!auth.isAdmin) {
      const requestedClientId = clientId || auth.clientId || "";
      if (!requestedClientId || requestedClientId !== auth.clientId) return jsonResponse({ error: "Forbidden." }, 403);
      const rows = await selectRows<any>("portal_users", {
        select: "id,client_id,display_name,role,disabled_at,created_at",
        order: "created_at.desc",
      });
      const users = rows
        .filter((user) =>
          !user.disabled_at
          && (user.client_id === requestedClientId || user.role === "admin" || user.role === "conneen_collaborator")
        )
        .map((user) => ({
          id: user.id,
          client_id: user.client_id,
          display_name: user.display_name,
          role: user.role,
        }));
      return jsonResponse({ users });
    }
    const users = await selectRows("portal_users", {
      select: "id,client_id,email,display_name,role,mfa_enabled,last_login_at,disabled_at,created_at",
      ...(clientId ? { client_id: eq(clientId) } : {}),
      order: "created_at.desc",
    });
    return jsonResponse({ users });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not load users." }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    if (!auth.isAdmin) return jsonResponse({ error: "Admin access required." }, 403);
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const email = cleanEmail(body.email);
    const displayName = cleanText(body.displayName, 120);
    const clientId = cleanText(body.clientId, 80) || null;
    const role = cleanText(body.role, 80) || "client_member";
    if (!email || !displayName) return jsonResponse({ error: "Email and display name are required." }, 400);

    const inviteToken = createToken();
    const user = await insertRow<any>("portal_users", {
      client_id: clientId,
      email,
      display_name: displayName,
      role,
      invited_at: new Date().toISOString(),
    });
    await insertRow("portal_invites", {
      client_id: clientId,
      email,
      role,
      token_hash: hashToken(inviteToken),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      created_by: auth.user.id,
    });
    const inviteUrl = buildPortalUrl({ invite: inviteToken, email });
    const inviteEmailSent = await sendPortalLinkEmail({
      clientId,
      userId: user.id,
      to: email,
      subject: "Your Conneen AI portal invite",
      heading: "Your Conneen AI portal invite",
      intro: `${auth.user.display_name || "Conneen AI"} invited you to the client portal.`,
      linkText: "Create your portal account",
      url: inviteUrl,
    });

    return jsonResponse(secretLinkPayload("inviteUrl", inviteUrl, {
      user,
      inviteEmailSent,
      message: inviteEmailSent
        ? "Invite email sent."
        : shouldReturnSecretLinks()
          ? "Invite created. Email delivery is not configured, so the local invite link is shown."
          : "Invite created, but email delivery is not configured. No invite link was returned in this environment.",
    }));
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not invite user." }, 500);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    if (!auth.isAdmin) return jsonResponse({ error: "Admin access required." }, 403);
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const id = cleanText(body.id, 80);
    if (!id) return jsonResponse({ error: "User id is required." }, 400);
    const payload: Record<string, unknown> = {
      display_name: cleanText(body.displayName, 120) || undefined,
      role: cleanText(body.role, 80) || undefined,
      mfa_enabled: typeof body.mfaEnabled === "boolean" ? body.mfaEnabled : undefined,
      disabled_at: body.disabled ? new Date().toISOString() : body.disabled === false ? null : undefined,
      updated_at: new Date().toISOString(),
    };
    if (typeof body.password === "string" && body.password.length >= 12) {
      payload.password_hash = await hashPassword(body.password);
      payload.accepted_invite_at = new Date().toISOString();
    }
    const [user] = await updateRows("portal_users", { id: eq(id) }, payload);
    return jsonResponse({ user });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not update user." }, 500);
  }
};
