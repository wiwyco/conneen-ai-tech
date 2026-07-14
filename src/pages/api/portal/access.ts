import type { APIRoute } from "astro";
import { logAudit } from "../../../lib/portal/activity";
import { requirePortalAuth } from "../../../lib/portal/auth";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { PORTAL_SECTIONS, PORTAL_SECTION_SENSITIVITY } from "../../../lib/portal/tables";
import { deleteRows, eq, insertRow, order, selectRows } from "../../../lib/portal/supabase";

export const prerender = false;

function nullableId(value: unknown) {
  return cleanText(value, 80) || null;
}

function boolValue(value: unknown, fallback = true) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

async function logAccessChange(auth: Awaited<ReturnType<typeof requirePortalAuth>>, action: string, targetTable: string, targetId?: string, metadata: Record<string, unknown> = {}) {
  await insertRow("portal_access_audit_logs", {
    actor_user_id: auth.user.id,
    action,
    target_table: targetTable,
    target_id: targetId || null,
    metadata,
  }).catch(() => null);
  await logAudit(auth, `access_${action}`, targetTable, targetId, null, metadata);
}

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const auth = await requirePortalAuth(request);
    if (!auth.isAdmin) return jsonResponse({ error: "Admin access required." }, 403);

    const clientId = cleanText(url.searchParams.get("clientId"), 80);
    const [groups, memberships, policies, grants, users, clients, projects, sectionAccess] = await Promise.all([
      selectRows("portal_permission_groups", {
        select: "*",
        order: order("name", true),
        limit: 1000,
      }).catch(() => []),
      selectRows("portal_permission_group_members", {
        select: "*",
        order: order("created_at", false),
        limit: 2000,
      }).catch(() => []),
      selectRows("portal_access_policies", {
        select: "*",
        order: order("created_at", false),
        limit: 2000,
      }).catch(() => []),
      selectRows("portal_record_access", {
        select: "*",
        ...(clientId ? { client_id: eq(clientId) } : {}),
        order: order("created_at", false),
        limit: 2000,
      }).catch(() => []),
      selectRows("portal_users", {
        select: "id,client_id,email,display_name,role,disabled_at",
        order: order("display_name", true),
        limit: 2000,
      }).catch(() => []),
      selectRows("portal_clients", {
        select: "id,name,status",
        order: order("name", true),
        limit: 1000,
      }).catch(() => []),
      selectRows("portal_projects", {
        select: "id,client_id,name,status",
        ...(clientId ? { client_id: eq(clientId) } : {}),
        order: order("name", true),
        limit: 1000,
      }).catch(() => []),
      selectRows<any>("portal_section_access", {
        select: "*",
        order: order("section", true),
        limit: 1000,
      }).catch(() => []),
    ]);
    const sensitivityBySection = new Map(sectionAccess.map((row: any) => [row.section, row]));

    return jsonResponse({
      groups,
      memberships,
      policies,
      grants,
      users,
      clients,
      projects,
      sections: Object.values(PORTAL_SECTIONS).map((section) => ({
        ...(sensitivityBySection.get(section.section) || {}),
        section: section.section,
        label: section.label,
        tableName: section.table,
        sensitivity: sensitivityBySection.get(section.section)?.sensitivity || section.sensitivity || PORTAL_SECTION_SENSITIVITY[section.section] || "client_shared",
        defaultClientVisible: sensitivityBySection.get(section.section)?.default_client_visible ?? true,
        clientScoped: section.clientScoped !== false,
        adminOnly: section.adminOnly === true,
      })),
      actions: ["read", "create", "update", "delete", "assign", "approve", "move_task", "complete_form", "upload_document"],
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not load access settings." }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    if (!auth.isAdmin) return jsonResponse({ error: "Admin access required." }, 403);

    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const action = cleanText(body.action, 80);

    if (action === "create_group") {
      const name = cleanText(body.name, 140);
      if (!name) return jsonResponse({ error: "Group name is required." }, 400);
      const group = await insertRow<any>("portal_permission_groups", {
        client_id: nullableId(body.clientId),
        project_id: nullableId(body.projectId),
        name,
        description: cleanText(body.description, 500) || null,
        is_system: false,
        created_by: auth.user.id,
      });
      await logAccessChange(auth, "create_group", "portal_permission_groups", group.id, { name });
      return jsonResponse({ group });
    }

    if (action === "add_member") {
      const groupId = nullableId(body.groupId);
      const userId = nullableId(body.userId);
      if (!groupId || !userId) return jsonResponse({ error: "Group and user are required." }, 400);
      const membership = await insertRow<any>("portal_permission_group_members", {
        group_id: groupId,
        user_id: userId,
        created_by: auth.user.id,
      });
      await logAccessChange(auth, "add_member", "portal_permission_group_members", membership.id, { groupId, userId });
      return jsonResponse({ membership });
    }

    if (action === "remove_member") {
      const membershipId = nullableId(body.membershipId);
      if (!membershipId) return jsonResponse({ error: "Membership id is required." }, 400);
      await deleteRows("portal_permission_group_members", { id: eq(membershipId) });
      await logAccessChange(auth, "remove_member", "portal_permission_group_members", membershipId);
      return jsonResponse({ ok: true });
    }

    if (action === "create_policy") {
      const groupId = nullableId(body.groupId);
      const section = cleanText(body.section, 80);
      const policyAction = cleanText(body.policyAction, 80) || "read";
      const visibility = cleanText(body.visibility, 20) || "shared";
      if (!groupId || !section) return jsonResponse({ error: "Group and section are required." }, 400);
      const policy = await insertRow<any>("portal_access_policies", {
        group_id: groupId,
        client_id: nullableId(body.clientId),
        project_id: nullableId(body.projectId),
        section,
        action: policyAction,
        visibility: ["shared", "internal", "any"].includes(visibility) ? visibility : "shared",
        allowed: boolValue(body.allowed, true),
        conditions: { source: "admin_ui" },
        created_by: auth.user.id,
      });
      await logAccessChange(auth, "create_policy", "portal_access_policies", policy.id, { groupId, section, policyAction });
      return jsonResponse({ policy });
    }

    if (action === "delete_policy") {
      const policyId = nullableId(body.policyId);
      if (!policyId) return jsonResponse({ error: "Policy id is required." }, 400);
      await deleteRows("portal_access_policies", { id: eq(policyId) });
      await logAccessChange(auth, "delete_policy", "portal_access_policies", policyId);
      return jsonResponse({ ok: true });
    }

    if (action === "create_grant") {
      const clientId = nullableId(body.clientId);
      const section = cleanText(body.section, 80);
      const recordId = nullableId(body.recordId);
      const subjectType = cleanText(body.subjectType, 20) === "group" ? "group" : "user";
      const subjectId = nullableId(body.subjectId);
      const grantAction = cleanText(body.grantAction, 80) || "read";
      if (!clientId || !section || !recordId || !subjectId) {
        return jsonResponse({ error: "Client, section, record id, and subject are required." }, 400);
      }
      const grant = await insertRow<any>("portal_record_access", {
        client_id: clientId,
        project_id: nullableId(body.projectId),
        section,
        record_id: recordId,
        subject_type: subjectType,
        subject_id: subjectId,
        action: grantAction,
        allowed: boolValue(body.allowed, true),
        expires_at: cleanText(body.expiresAt, 40) || null,
        created_by: auth.user.id,
      });
      await logAccessChange(auth, "create_grant", "portal_record_access", grant.id, { clientId, section, recordId, subjectType, subjectId });
      return jsonResponse({ grant });
    }

    if (action === "delete_grant") {
      const grantId = nullableId(body.grantId);
      if (!grantId) return jsonResponse({ error: "Grant id is required." }, 400);
      await deleteRows("portal_record_access", { id: eq(grantId) });
      await logAccessChange(auth, "delete_grant", "portal_record_access", grantId);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Unknown access action." }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not update access settings." }, 500);
  }
};
