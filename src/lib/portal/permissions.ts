import type { PortalAuth } from "./auth";
import { canAccessClient } from "./auth";
import { cleanText } from "./http";
import { eq, selectRows } from "./supabase";
import { PORTAL_SECTION_SENSITIVITY } from "./tables";

export type PortalAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "assign"
  | "approve"
  | "move_task"
  | "complete_form"
  | "upload_document"
  | string;

type AccessPolicy = {
  id: string;
  group_id: string | null;
  client_id?: string | null;
  project_id?: string | null;
  section: string;
  action: string;
  visibility?: string | null;
  allowed: boolean;
};

type RecordGrant = {
  id: string;
  client_id?: string | null;
  project_id?: string | null;
  section: string;
  record_id: string;
  subject_type: "user" | "group";
  subject_id: string;
  action: string;
  allowed: boolean;
  expires_at?: string | null;
};

export type PortalAccessContext = {
  groupIds: Set<string>;
  policies: AccessPolicy[];
  recordGrants: RecordGrant[];
};

type AccessRequest = {
  section: string;
  action: PortalAction;
  clientId?: string | null;
  projectId?: string | null;
  recordId?: string | null;
  visibility?: string | null;
  record?: Record<string, any> | null;
};

function inList(values: string[]) {
  return `in.(${values.join(",")})`;
}

function matchesScope(item: AccessPolicy | RecordGrant, request: AccessRequest) {
  if (item.section !== "*" && item.section !== request.section) return false;
  if (item.action !== "*" && item.action !== request.action) return false;
  if (item.client_id && request.clientId && item.client_id !== request.clientId) return false;
  if (item.client_id && !request.clientId) return false;
  if (item.project_id && request.projectId && item.project_id !== request.projectId) return false;
  if (item.project_id && !request.projectId) return false;
  return true;
}

function matchesVisibility(policy: AccessPolicy, visibility: string) {
  const policyVisibility = cleanText(policy.visibility, 20) || "shared";
  if (policyVisibility === "any") return true;
  if (visibility === "internal") return policyVisibility === "internal";
  return policyVisibility === "shared" || policyVisibility === "internal";
}

function grantIsActive(grant: RecordGrant) {
  return !grant.expires_at || new Date(grant.expires_at).getTime() > Date.now();
}

function recordVisibility(request: AccessRequest) {
  return cleanText(request.record?.visibility || request.visibility, 20) === "internal" ? "internal" : "shared";
}

function sectionSensitivity(section: string) {
  return PORTAL_SECTION_SENSITIVITY[section] || "client_shared";
}

function isAdminLockedSection(section: string) {
  const sensitivity = sectionSensitivity(section);
  return sensitivity === "internal_admin" || sensitivity === "security_sensitive";
}

function isCommercialSection(section: string) {
  return sectionSensitivity(section) === "commercial_sensitive";
}

function isCommercialClientVisible(request: AccessRequest) {
  if (!isCommercialSection(request.section) || request.action !== "read") return true;
  if (!request.record && !request.visibility) return true;
  return recordVisibility(request) === "shared";
}

export async function loadPortalAccessContext(auth: PortalAuth, clientId?: string | null): Promise<PortalAccessContext> {
  if (auth.isAdmin) return { groupIds: new Set(), policies: [], recordGrants: [] };

  const [roleGroups, memberships] = await Promise.all([
    selectRows<any>("portal_permission_groups", {
      select: "id",
      role_key: eq(auth.user.role),
      limit: 20,
    }).catch(() => []),
    selectRows<any>("portal_permission_group_members", {
      select: "group_id",
      user_id: eq(auth.user.id),
      limit: 200,
    }).catch(() => []),
  ]);

  const groupIds = new Set<string>([
    ...roleGroups.map((group) => group.id).filter(Boolean),
    ...memberships.map((membership) => membership.group_id).filter(Boolean),
  ]);

  const [policies, recordGrants] = await Promise.all([
    groupIds.size
      ? selectRows<AccessPolicy>("portal_access_policies", {
          select: "*",
          group_id: inList([...groupIds]),
          limit: 1000,
        }).catch(() => [])
      : Promise.resolve([]),
    clientId
      ? selectRows<RecordGrant>("portal_record_access", {
          select: "*",
          client_id: eq(clientId),
          limit: 1000,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  return { groupIds, policies, recordGrants };
}

export async function canPortalAction(
  auth: PortalAuth,
  request: AccessRequest,
  context?: PortalAccessContext
): Promise<boolean> {
  if (auth.isAdmin) return true;
  if (isAdminLockedSection(request.section)) return false;
  const clientId = cleanText(request.clientId, 80);
  if (clientId && !canAccessClient(auth, clientId)) return false;
  if (!clientId && request.section !== "clients") return false;

  const access = context || await loadPortalAccessContext(auth, clientId);
  const visibility = recordVisibility(request);
  const recordId = cleanText(request.recordId || request.record?.id, 80);

  if (recordId) {
    const matchingGrants = access.recordGrants.filter((grant) =>
      grant.record_id === recordId
      && grantIsActive(grant)
      && matchesScope(grant, request)
      && (
        grant.subject_type === "user" && grant.subject_id === auth.user.id
        || grant.subject_type === "group" && access.groupIds.has(grant.subject_id)
      )
    );
    if (matchingGrants.some((grant) => grant.allowed === false)) return false;
    if (matchingGrants.some((grant) => grant.allowed === true)) return true;
  }

  if (!isCommercialClientVisible(request)) return false;

  const matchingPolicies = access.policies.filter((policy) =>
    matchesScope(policy, request) && matchesVisibility(policy, visibility)
  );
  if (matchingPolicies.some((policy) => policy.allowed === false)) return false;
  return matchingPolicies.some((policy) => policy.allowed === true);
}

export async function filterReadableRecords<T extends Record<string, any>>(
  auth: PortalAuth,
  section: string,
  clientId: string,
  rows: T[],
  context?: PortalAccessContext
): Promise<T[]> {
  const access = context || await loadPortalAccessContext(auth, clientId);
  const visible: T[] = [];
  for (const row of rows) {
    if (await canPortalAction(auth, {
      section,
      action: "read",
      clientId,
      projectId: row.project_id || null,
      recordId: row.id,
      record: row,
    }, access)) {
      visible.push(row);
    }
  }
  return visible;
}
