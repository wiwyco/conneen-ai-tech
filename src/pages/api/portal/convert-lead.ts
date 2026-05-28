import type { APIRoute } from "astro";
import { requirePortalAuth } from "../../../lib/portal/auth";
import { logAudit, logTimeline } from "../../../lib/portal/activity";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { eq, insertRow, selectOne, updateRows } from "../../../lib/portal/supabase";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    if (!auth.isAdmin) return jsonResponse({ error: "Admin access required." }, 403);
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const leadId = cleanText(body.leadId, 80);
    if (!leadId) return jsonResponse({ error: "Lead id is required." }, 400);

    const lead = await selectOne<any>("diagnostic_leads", { id: eq(leadId) });
    if (!lead) return jsonResponse({ error: "Lead not found." }, 404);

    const client = await insertRow<any>("portal_clients", {
      name: lead.company || lead.name || lead.email,
      primary_contact_name: lead.name || null,
      primary_contact_email: lead.email || null,
      created_from_lead_id: lead.id,
      admin_status: "converted from Scout",
    });
    await insertRow("portal_scout_transcripts", {
      client_id: client.id,
      diagnostic_lead_id: lead.id,
      title: "Original Scout diagnostic",
      transcript: lead.transcript || [],
      summary: lead.workflow_summary || null,
    });
    await insertRow("portal_business_knowledge", {
      client_id: client.id,
      title: "Original workflow summary",
      category: "lead conversion",
      content: lead.workflow_summary || "Converted from Scout diagnostic lead.",
      source_type: "diagnostic_lead",
      source_id: lead.id,
      visibility: "shared",
    });
    await updateRows("diagnostic_leads", { id: eq(leadId) }, { status: "converted" }).catch(() => []);
    await logAudit(auth, "convert_lead", "diagnostic_leads", lead.id, client.id);
    await logTimeline(client.id, "Scout lead converted into client workspace", { auth, eventType: "lead_converted" });

    return jsonResponse({ client });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Lead conversion failed." }, 500);
  }
};
