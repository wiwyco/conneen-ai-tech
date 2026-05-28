import type { APIRoute } from "astro";
import { hashPassword } from "../../../lib/portal/auth";
import { getEnv } from "../../../lib/portal/env";
import { cleanEmail, cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { insertRow, selectOne, eq } from "../../../lib/portal/supabase";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const secret = cleanText(body?.secret, 500);
    const expected = getEnv("PORTAL_BOOTSTRAP_SECRET");
    if (!expected || secret !== expected) return jsonResponse({ error: "Invalid bootstrap secret." }, 403);

    const email = cleanEmail(body?.email);
    const password = cleanText(body?.password, 200);
    const displayName = cleanText(body?.displayName, 120) || "Conneen AI Admin";
    if (!email || password.length < 12) {
      return jsonResponse({ error: "Admin email and a 12+ character password are required." }, 400);
    }

    const existing = await selectOne("portal_users", { email: eq(email) });
    if (existing) return jsonResponse({ ok: true, message: "Admin already exists." });

    const user = await insertRow("portal_users", {
      email,
      display_name: displayName,
      role: "admin",
      password_hash: await hashPassword(password),
      accepted_invite_at: new Date().toISOString(),
    });

    return jsonResponse({ ok: true, user });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Bootstrap failed." }, 500);
  }
};
