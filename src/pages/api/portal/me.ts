import type { APIRoute } from "astro";
import { authenticateRequest } from "../../../lib/portal/auth";
import { jsonResponse } from "../../../lib/portal/http";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = await authenticateRequest(request);
  if (!auth) return jsonResponse({ user: null }, 401);
  return jsonResponse({
    user: { ...auth.user, password_hash: undefined },
    isAdmin: auth.isAdmin,
    clientId: auth.clientId,
  });
};
