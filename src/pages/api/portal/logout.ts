import type { APIRoute } from "astro";
import { authenticateRequest, clearSessionCookie, hashToken, PORTAL_SESSION_COOKIE } from "../../../lib/portal/auth";
import { parseCookie } from "../../../lib/portal/http";
import { eq, updateRows } from "../../../lib/portal/supabase";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const token = parseCookie(request.headers.get("cookie"))[PORTAL_SESSION_COOKIE];
  const auth = await authenticateRequest(request);
  if (token && auth) {
    await updateRows("portal_sessions", { token_hash: eq(hashToken(token)) }, { revoked_at: new Date().toISOString() }).catch(() => []);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie(),
    },
  });
};
