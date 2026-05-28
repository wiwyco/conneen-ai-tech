import type { APIRoute } from "astro";
import { requirePortalAuth } from "../../../lib/portal/auth";
import { logAudit, logTimeline } from "../../../lib/portal/activity";
import { cleanEmail, cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { eq, insertRow, order, selectRows, updateRows } from "../../../lib/portal/supabase";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    if (!auth.isAdmin) return jsonResponse({ error: "Admin access required." }, 403);
    const clients = await selectRows("portal_clients", { select: "*", order: order("created_at") });
    return jsonResponse({ clients });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not load clients." }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    if (!auth.isAdmin) return jsonResponse({ error: "Admin access required." }, 403);
    const body = await readJson<Record<string, unknown>>(request);
    const name = cleanText(body?.name, 180);
    if (!name) return jsonResponse({ error: "Client name is required." }, 400);

    const client = await insertRow<any>("portal_clients", {
      name,
      industry: cleanText(body?.industry, 180) || null,
      website: cleanText(body?.website, 300) || null,
      primary_contact_name: cleanText(body?.primary_contact_name, 180) || null,
      primary_contact_email: cleanEmail(body?.primary_contact_email) || null,
      communication_style: cleanText(body?.communication_style, 800) || null,
      technical_comfort: cleanText(body?.technical_comfort, 800) || null,
      budget_notes: cleanText(body?.budget_notes, 800) || null,
    });

    await logAudit(auth, "create", "portal_clients", client.id, client.id);
    await logTimeline(client.id, "Client workspace created", { auth, eventType: "client_created" });
    return jsonResponse({ client });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not create client." }, 500);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    if (!auth.isAdmin) return jsonResponse({ error: "Admin access required." }, 403);
    const body = await readJson<Record<string, unknown>>(request);
    const id = cleanText(body?.id, 80);
    if (!id) return jsonResponse({ error: "Client id is required." }, 400);

    const [client] = await updateRows("portal_clients", { id: eq(id) }, {
      name: cleanText(body?.name, 180) || undefined,
      status: cleanText(body?.status, 80) || undefined,
      admin_status: cleanText(body?.admin_status, 120) || undefined,
      updated_at: new Date().toISOString(),
    });
    await logAudit(auth, "update", "portal_clients", id, id);
    return jsonResponse({ client });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not update client." }, 500);
  }
};
