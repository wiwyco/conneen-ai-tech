-- Adds database-backed portal permissions.
-- Run this once after supabase/client_portal.sql on existing databases.

create table if not exists portal_permission_groups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete cascade,
  name text not null,
  group_key text,
  role_key text,
  description text,
  is_system boolean not null default false,
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_key),
  unique (role_key)
);

create table if not exists portal_permission_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references portal_permission_groups(id) on delete cascade,
  user_id uuid not null references portal_users(id) on delete cascade,
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists portal_access_policies (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references portal_permission_groups(id) on delete cascade,
  client_id uuid references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete cascade,
  section text not null,
  action text not null,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal', 'any')),
  allowed boolean not null default true,
  conditions jsonb not null default '{}'::jsonb,
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_record_access (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete cascade,
  section text not null,
  record_id uuid not null,
  subject_type text not null check (subject_type in ('user', 'group')),
  subject_id uuid not null,
  action text not null default 'read',
  allowed boolean not null default true,
  expires_at timestamptz,
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_access_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references portal_users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists portal_section_access (
  section text primary key,
  table_name text,
  sensitivity text not null default 'client_shared' check (sensitivity in ('public_client', 'client_shared', 'commercial_sensitive', 'internal_admin', 'security_sensitive')),
  default_client_visible boolean not null default true,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists portal_rate_limits (
  key text primary key,
  route text not null,
  subject_hash text not null,
  window_start timestamptz not null default now(),
  count int not null default 1,
  blocked_until timestamptz,
  last_seen_at timestamptz not null default now()
);

alter table portal_estimates
  add column if not exists visibility text not null default 'internal' check (visibility in ('shared', 'internal'));

alter table portal_payments
  add column if not exists visibility text not null default 'internal' check (visibility in ('shared', 'internal'));

alter table portal_invoices
  add column if not exists visibility text not null default 'internal' check (visibility in ('shared', 'internal'));

alter table portal_contracts
  add column if not exists visibility text not null default 'internal' check (visibility in ('shared', 'internal'));

alter table portal_roi_notes
  add column if not exists visibility text not null default 'internal' check (visibility in ('shared', 'internal'));

alter table portal_payments alter column visibility set default 'internal';

update portal_estimates set visibility = 'internal' where visibility is null or approval_status in ('draft', 'planning', 'pending');
update portal_payments set visibility = 'internal' where visibility is null or status in ('planned', 'draft', 'pending');
update portal_invoices set visibility = 'internal' where visibility is null or status in ('draft', 'planned', 'pending');
update portal_contracts set visibility = 'internal' where visibility is null or status in ('draft', 'pending');
update portal_roi_notes set visibility = 'internal' where visibility is null;

create index if not exists portal_permission_groups_scope_idx on portal_permission_groups(client_id, project_id);
create index if not exists portal_permission_group_members_user_idx on portal_permission_group_members(user_id);
create index if not exists portal_access_policies_group_idx on portal_access_policies(group_id, section, action);
create index if not exists portal_record_access_record_idx on portal_record_access(client_id, section, record_id);
create index if not exists portal_record_access_subject_idx on portal_record_access(subject_type, subject_id);
create index if not exists portal_rate_limits_route_idx on portal_rate_limits(route, last_seen_at desc);

insert into portal_section_access (section, table_name, sensitivity, default_client_visible, notes)
values
  ('documents', 'portal_documents', 'client_shared', true, 'Shared client documents and folders.'),
  ('projects', 'portal_projects', 'client_shared', true, 'Client-visible project workspace records.'),
  ('tasks', 'portal_tasks', 'client_shared', true, 'Client-visible work queue records.'),
  ('estimates', 'portal_estimates', 'commercial_sensitive', false, 'Planning estimates and quotes. Shared only after admin approval.'),
  ('payments', 'portal_payments', 'commercial_sensitive', false, 'Payment planning and milestone payment records.'),
  ('invoices', 'portal_invoices', 'commercial_sensitive', false, 'Invoice records and draft billing information.'),
  ('contracts', 'portal_contracts', 'commercial_sensitive', false, 'SOW and contract records.'),
  ('roi_notes', 'portal_roi_notes', 'commercial_sensitive', false, 'Internal ROI and value notes.'),
  ('admin_notes', 'portal_admin_notes', 'internal_admin', false, 'Internal admin notes.'),
  ('followup_reminders', 'portal_followup_reminders', 'internal_admin', false, 'Internal follow-up reminders.'),
  ('scout_transcripts', 'portal_scout_transcripts', 'internal_admin', false, 'Scout transcript archive.'),
  ('audit_logs', 'portal_audit_logs', 'security_sensitive', false, 'Audit logs are never client-accessible.'),
  ('access_audit_logs', 'portal_access_audit_logs', 'security_sensitive', false, 'Access-management audit logs.'),
  ('email_events', 'portal_email_events', 'security_sensitive', false, 'Email delivery events.'),
  ('sessions', 'portal_sessions', 'security_sensitive', false, 'Session records.'),
  ('invites', 'portal_invites', 'security_sensitive', false, 'Invite tokens.'),
  ('password_resets', 'portal_password_resets', 'security_sensitive', false, 'Password reset tokens.'),
  ('magic_links', 'portal_magic_links', 'security_sensitive', false, 'Magic link tokens.'),
  ('permission_groups', 'portal_permission_groups', 'security_sensitive', false, 'Permission groups.'),
  ('permission_group_members', 'portal_permission_group_members', 'security_sensitive', false, 'Permission group memberships.'),
  ('access_policies', 'portal_access_policies', 'security_sensitive', false, 'Permission policies.'),
  ('record_access', 'portal_record_access', 'security_sensitive', false, 'Record-level grants.')
on conflict (section) do update set
  table_name = excluded.table_name,
  sensitivity = excluded.sensitivity,
  default_client_visible = excluded.default_client_visible,
  notes = excluded.notes,
  updated_at = now();

insert into portal_permission_groups (name, group_key, role_key, description, is_system)
values
  ('Admin', 'system:admin', 'admin', 'Full administrative access. Code also preserves this as a safety fallback.', true),
  ('Conneen Collaborator', 'system:conneen_collaborator', 'conneen_collaborator', 'Full Conneen AI internal access. Code also preserves this as a safety fallback.', true),
  ('Client Owner', 'system:client_owner', 'client_owner', 'Default owner access for client workspaces.', true),
  ('Client Member', 'system:client_member', 'client_member', 'Default member access for client workspaces.', true)
on conflict (group_key) do update set
  name = excluded.name,
  role_key = excluded.role_key,
  description = excluded.description,
  is_system = excluded.is_system,
  updated_at = now();

do $$
declare
  admin_group uuid;
  collaborator_group uuid;
  owner_group uuid;
  member_group uuid;
  section_name text;
begin
  select id into admin_group from portal_permission_groups where role_key = 'admin';
  select id into collaborator_group from portal_permission_groups where role_key = 'conneen_collaborator';
  select id into owner_group from portal_permission_groups where role_key = 'client_owner';
  select id into member_group from portal_permission_groups where role_key = 'client_member';

  delete from portal_access_policies
  where group_id in (admin_group, collaborator_group, owner_group, member_group)
    and (conditions->>'seed') = 'default-v1';

  insert into portal_access_policies (group_id, section, action, visibility, allowed, conditions)
  values
    (admin_group, '*', '*', 'any', true, '{"seed":"default-v1"}'::jsonb),
    (collaborator_group, '*', '*', 'any', true, '{"seed":"default-v1"}'::jsonb);

  foreach section_name in array array[
    'documents','projects','milestones','tasks','timeline_events','decisions','meetings','meeting_action_items',
    'checklist_items','data_requests','data_submissions','system_access','requirements','change_requests',
    'support_tickets','training_materials','handover_items','business_goals',
    'success_metrics','measurements','risks','open_questions','notifications','tour_steps','calendar_events'
  ]
  loop
    insert into portal_access_policies (group_id, section, action, visibility, allowed, conditions)
    values
      (owner_group, section_name, 'read', 'shared', true, '{"seed":"default-v1"}'::jsonb),
      (member_group, section_name, 'read', 'shared', true, '{"seed":"default-v1"}'::jsonb);
  end loop;

  foreach section_name in array array['documents','data_submissions','task_comments','calendar_events']
  loop
    insert into portal_access_policies (group_id, section, action, visibility, allowed, conditions)
    values
      (owner_group, section_name, 'create', 'shared', true, '{"seed":"default-v1"}'::jsonb),
      (member_group, section_name, 'create', 'shared', true, '{"seed":"default-v1"}'::jsonb);
  end loop;

  insert into portal_access_policies (group_id, section, action, visibility, allowed, conditions)
  values
    (owner_group, 'documents', 'upload_document', 'shared', true, '{"seed":"default-v1"}'::jsonb),
    (member_group, 'documents', 'upload_document', 'shared', true, '{"seed":"default-v1"}'::jsonb),
    (owner_group, 'tasks', 'move_task', 'shared', true, '{"seed":"default-v1"}'::jsonb),
    (member_group, 'tasks', 'move_task', 'shared', true, '{"seed":"default-v1"}'::jsonb),
    (owner_group, 'tasks', 'complete_form', 'shared', true, '{"seed":"default-v1"}'::jsonb),
    (member_group, 'tasks', 'complete_form', 'shared', true, '{"seed":"default-v1"}'::jsonb),
    (owner_group, 'tasks', 'upload_document', 'shared', true, '{"seed":"default-v1"}'::jsonb),
    (member_group, 'tasks', 'upload_document', 'shared', true, '{"seed":"default-v1"}'::jsonb),
    (owner_group, 'projects', 'create', 'shared', true, '{"seed":"default-v1"}'::jsonb),
    (owner_group, 'calendar_events', 'update', 'shared', true, '{"seed":"default-v1"}'::jsonb),
    (member_group, 'calendar_events', 'update', 'shared', true, '{"seed":"default-v1"}'::jsonb);
end $$;

alter table portal_permission_groups enable row level security;
alter table portal_permission_group_members enable row level security;
alter table portal_access_policies enable row level security;
alter table portal_record_access enable row level security;
alter table portal_access_audit_logs enable row level security;
alter table portal_section_access enable row level security;
alter table portal_rate_limits enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'portal_permission_groups','portal_permission_group_members','portal_access_policies',
    'portal_record_access','portal_access_audit_logs','portal_section_access','portal_rate_limits'
  ]
  loop
    execute format('drop policy if exists "%s service role all" on %I', t, t);
    execute format('create policy "%s service role all" on %I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')', t, t);
  end loop;
end $$;
