-- Conneen AI Supabase schema freeze.
-- Re-run this whole file in the Supabase SQL editor to apply the current ordered schema/migrations.
-- Generated at: 2026-07-28T05:31:31.806Z

-- =========================================================================
-- 20260517000000_diagnostic_leads.sql
-- =========================================================================
create extension if not exists pgcrypto;

create table if not exists public.diagnostic_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new',
  source text not null default 'workflow_diagnostic',
  name text,
  email text not null,
  company text,
  phone text,
  workflow_type text,
  workflow_summary text,
  diagnostic_summary jsonb not null default '{}'::jsonb,
  transcript jsonb not null default '[]'::jsonb,
  user_agent text,
  page_path text
);

alter table public.diagnostic_leads enable row level security;

create index if not exists diagnostic_leads_created_at_idx
  on public.diagnostic_leads (created_at desc);

create index if not exists diagnostic_leads_status_idx
  on public.diagnostic_leads (status);

create index if not exists diagnostic_leads_workflow_type_idx
  on public.diagnostic_leads (workflow_type);


-- =========================================================================
-- 20260526000000_client_portal_base.sql
-- =========================================================================
-- Conneen AI client portal schema.
-- Run this in the Supabase SQL editor after diagnostic_leads.sql.
-- The app uses server-side API routes with SUPABASE_SERVICE_ROLE_KEY for writes.
-- RLS policies are included as a defensive baseline for future direct Supabase clients.

create extension if not exists pgcrypto;
create extension if not exists vector;

insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

create table if not exists portal_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  industry text,
  website text,
  locations text,
  team_size text,
  primary_contact_name text,
  primary_contact_email text,
  communication_style text,
  technical_comfort text,
  budget_notes text,
  admin_status text default 'active client',
  created_from_lead_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references portal_clients(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('admin', 'conneen_collaborator', 'client_owner', 'client_member')),
  password_hash text,
  mfa_enabled boolean not null default false,
  mfa_secret text,
  last_login_at timestamptz,
  invited_at timestamptz,
  accepted_invite_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references portal_users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip_address text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists portal_invites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references portal_clients(id) on delete cascade,
  email text not null,
  role text not null default 'client_member',
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists portal_password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references portal_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists portal_magic_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references portal_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists portal_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  organization_side text default 'client',
  title text,
  responsibilities text,
  notes text,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid,
  folder_id uuid,
  title text not null,
  category text default 'general',
  tags text[] not null default '{}',
  storage_bucket text default 'client-documents',
  storage_path text,
  file_name text,
  file_type text,
  file_size bigint,
  review_status text default 'new',
  sensitivity text default 'normal',
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  description text,
  uploaded_by uuid references portal_users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_document_folders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  parent_folder_id uuid references portal_document_folders(id) on delete cascade,
  name text not null,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table portal_documents
  add column if not exists folder_id uuid references portal_document_folders(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'portal_documents_folder_fk'
  ) then
    alter table portal_documents
      add constraint portal_documents_folder_fk
      foreign key (folder_id) references portal_document_folders(id) on delete set null;
  end if;
end $$;

create table if not exists portal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references portal_documents(id) on delete cascade,
  version_label text not null default 'v1',
  storage_path text,
  file_name text,
  file_type text,
  file_size bigint,
  uploaded_by uuid references portal_users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists portal_document_notes (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references portal_documents(id) on delete cascade,
  client_id uuid not null references portal_clients(id) on delete cascade,
  note text not null,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists portal_business_knowledge (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  title text not null,
  category text default 'business context',
  content text not null,
  source_type text default 'manual',
  source_id uuid,
  tags text[] not null default '{}',
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  source_table text not null,
  source_id uuid not null,
  chunk_text text not null,
  embedding vector(1536),
  tags text[] not null default '{}',
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now()
);

create table if not exists portal_workflows (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  name text not null,
  agile_epic text,
  current_process text,
  pain_points text,
  tools text,
  inputs text,
  outputs text,
  people_involved text,
  frequency text,
  cost_of_pain text,
  automation_opportunity text,
  workflow_type text,
  status text default 'discovered',
  priority text default 'medium',
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_pain_points (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  workflow_id uuid references portal_workflows(id) on delete set null,
  title text not null,
  description text,
  severity text default 'medium',
  business_impact text,
  status text default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_opportunities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  workflow_id uuid references portal_workflows(id) on delete set null,
  title text not null,
  description text,
  value_score int default 3,
  difficulty_score int default 3,
  urgency_score int default 3,
  readiness_score int default 3,
  recommended_next_step text,
  status text default 'backlog',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  name text not null,
  agile_stage text default 'discovery',
  status text default 'active',
  scope text,
  goals text,
  deliverables text,
  owner_user_id uuid references portal_users(id) on delete set null,
  start_date date,
  target_date date,
  health_status text default 'on track',
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'portal_documents_project_fk'
  ) then
    alter table portal_documents
      add constraint portal_documents_project_fk
      foreign key (project_id) references portal_projects(id) on delete set null;
  end if;
end $$;

create table if not exists portal_milestones (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete cascade,
  name text not null,
  stage text default 'discovery',
  status text default 'not started',
  due_date date,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete cascade,
  user_story_id uuid,
  title text not null,
  description text,
  status text default 'todo',
  task_type text default 'development',
  priority text default 'normal',
  expected_hours numeric,
  success_metrics text,
  risks text,
  form_schema jsonb not null default '{}'::jsonb,
  form_response jsonb,
  upload_items jsonb not null default '[]'::jsonb,
  assigned_to uuid references portal_users(id) on delete set null,
  due_date date,
  completed_at timestamptz,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_task_comments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  task_id uuid not null references portal_tasks(id) on delete cascade,
  comment text not null,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists portal_decisions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  decision text not null,
  rationale text,
  decided_by text,
  decided_at date default current_date,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now()
);

create table if not exists portal_meetings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  meeting_at timestamptz,
  attendees text,
  notes text,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  meeting_id uuid references portal_meetings(id) on delete cascade,
  task_id uuid references portal_tasks(id) on delete set null,
  action text not null,
  owner text,
  due_date date,
  status text default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_timeline_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  event_type text not null,
  title text not null,
  description text,
  actor_user_id uuid references portal_users(id) on delete set null,
  source_table text,
  source_id uuid,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now()
);

create table if not exists portal_checklist_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  checklist_type text not null default 'onboarding',
  title text not null,
  description text,
  status text default 'open',
  due_date date,
  assigned_to uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_data_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  title text not null,
  requested_items text,
  status text default 'open',
  due_date date,
  requested_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_data_submissions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  data_request_id uuid references portal_data_requests(id) on delete set null,
  title text not null,
  notes text,
  document_id uuid references portal_documents(id) on delete set null,
  submitted_by uuid references portal_users(id) on delete set null,
  status text default 'submitted',
  created_at timestamptz not null default now()
);

create table if not exists portal_system_access (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  system_name text not null,
  access_type text,
  status text default 'requested',
  owner_contact text,
  safe_instructions text,
  integration_status text default 'not started',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_architecture_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  content text,
  diagram_url text,
  visibility text not null default 'internal' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_requirements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  requirement_type text default 'functional',
  title text not null,
  description text,
  priority text default 'should',
  status text default 'proposed',
  acceptance_criteria text,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table portal_tasks
  add column if not exists user_story_id uuid,
  add column if not exists task_type text default 'development',
  add column if not exists expected_hours numeric,
  add column if not exists success_metrics text,
  add column if not exists risks text,
  add column if not exists form_schema jsonb not null default '{}'::jsonb,
  add column if not exists form_response jsonb,
  add column if not exists upload_items jsonb not null default '[]'::jsonb,
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'portal_tasks_user_story_fk'
  ) then
    alter table portal_tasks
      add constraint portal_tasks_user_story_fk
      foreign key (user_story_id) references portal_requirements(id) on delete set null;
  end if;
end $$;

create table if not exists portal_change_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  description text,
  status text default 'requested',
  impact_notes text,
  approval_notes text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_estimates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  estimate_type text default 'planning estimate',
  hourly_rate numeric default 150,
  hour_range_low numeric,
  hour_range_high numeric,
  assumptions text,
  approval_status text default 'draft',
  approved_at timestamptz,
  document_id uuid references portal_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  milestone_id uuid references portal_milestones(id) on delete set null,
  title text not null,
  amount numeric,
  status text default 'planned',
  due_date date,
  paid_at timestamptz,
  invoice_document_id uuid references portal_documents(id) on delete set null,
  notes text,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  invoice_number text,
  amount numeric,
  status text default 'draft',
  issued_at date,
  due_date date,
  paid_at timestamptz,
  document_id uuid references portal_documents(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  contract_type text default 'SOW',
  status text default 'draft',
  signed_at date,
  document_id uuid references portal_documents(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_support_tickets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  description text,
  status text default 'new',
  priority text default 'normal',
  issue_type text,
  assigned_to uuid references portal_users(id) on delete set null,
  resolved_at timestamptz,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_support_comments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  ticket_id uuid not null references portal_support_tickets(id) on delete cascade,
  comment text not null,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists portal_training_materials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  material_type text default 'guide',
  description text,
  document_id uuid references portal_documents(id) on delete set null,
  url text,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_handover_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  description text,
  document_id uuid references portal_documents(id) on delete set null,
  status text default 'draft',
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_faqs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  question text not null,
  answer text not null,
  tags text[] not null default '{}',
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_ai_memories (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  title text not null,
  memory_type text default 'client fact',
  content text not null,
  confidence text default 'confirmed',
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_scout_transcripts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  diagnostic_lead_id uuid,
  title text default 'Scout conversation',
  transcript jsonb not null default '[]'::jsonb,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists portal_business_goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  title text not null,
  description text,
  status text default 'active',
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_success_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  goal_id uuid references portal_business_goals(id) on delete set null,
  name text not null,
  baseline_value text,
  target_value text,
  current_value text,
  measurement_method text,
  status text default 'tracking',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_measurements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  metric_id uuid references portal_success_metrics(id) on delete cascade,
  measurement_date date default current_date,
  value text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists portal_roi_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  time_saved_notes text,
  revenue_impact_notes text,
  quality_impact_notes text,
  estimate_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_risks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  description text,
  severity text default 'medium',
  mitigation text,
  status text default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_open_questions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  question text not null,
  owner text,
  status text default 'open',
  answer text,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_preferences (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  communication_style text,
  meeting_preferences text,
  technical_comfort text,
  reporting_cadence text,
  budget_sensitivity text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  user_id uuid references portal_users(id) on delete cascade,
  title text not null,
  body text,
  notification_type text default 'update',
  read_at timestamptz,
  source_table text,
  source_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists portal_tour_steps (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal_clients(id) on delete cascade,
  title text not null,
  body text,
  portal_section text not null default 'dashboard',
  source_table text,
  source_id uuid,
  sort_order int not null default 0,
  completed_at timestamptz,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_admin_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  note text not null,
  status_label text,
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_followup_reminders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text default 'open',
  notes text,
  assigned_to uuid references portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_calendar_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references portal_clients(id) on delete cascade,
  project_id uuid references portal_projects(id) on delete set null,
  title text not null,
  event_at timestamptz,
  duration_minutes int not null default 60,
  event_type text default 'meeting',
  location text,
  meeting_provider text default 'zoom',
  meeting_provider_id text,
  meeting_url text,
  meeting_password text,
  meeting_join_instructions text,
  scout_meeting_status text default 'scheduled',
  scout_live_transcript jsonb not null default '[]'::jsonb,
  scout_meeting_notes text,
  scout_key_takeaways text,
  scout_draft_deliverables text,
  scout_live_responses jsonb not null default '[]'::jsonb,
  scout_is_addressed boolean not null default false,
  scout_response_delivery text default 'voice',
  scout_latest_response text,
  scout_latest_response_at timestamptz,
  scout_stop_requested_at timestamptz,
  scout_last_summary_at timestamptz,
  notes text,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table portal_calendar_events
  add column if not exists duration_minutes int not null default 60,
  add column if not exists meeting_provider text default 'zoom',
  add column if not exists meeting_provider_id text,
  add column if not exists meeting_url text,
  add column if not exists meeting_password text,
  add column if not exists meeting_join_instructions text,
  add column if not exists scout_meeting_status text default 'scheduled',
  add column if not exists scout_live_transcript jsonb not null default '[]'::jsonb,
  add column if not exists scout_meeting_notes text,
  add column if not exists scout_key_takeaways text,
  add column if not exists scout_draft_deliverables text,
  add column if not exists scout_live_responses jsonb not null default '[]'::jsonb,
  add column if not exists scout_is_addressed boolean not null default false,
  add column if not exists scout_response_delivery text default 'voice',
  add column if not exists scout_latest_response text,
  add column if not exists scout_latest_response_at timestamptz,
  add column if not exists scout_stop_requested_at timestamptz,
  add column if not exists scout_last_summary_at timestamptz;

create table if not exists portal_audit_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references portal_clients(id) on delete set null,
  actor_user_id uuid references portal_users(id) on delete set null,
  action text not null,
  table_name text,
  record_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists portal_email_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references portal_clients(id) on delete cascade,
  user_id uuid references portal_users(id) on delete set null,
  email_to text,
  subject text,
  status text default 'queued',
  provider_response jsonb,
  created_at timestamptz not null default now()
);

create index if not exists portal_clients_status_idx on portal_clients(status);
create index if not exists portal_users_email_idx on portal_users(lower(email));
create index if not exists portal_sessions_token_hash_idx on portal_sessions(token_hash);
create index if not exists portal_documents_client_idx on portal_documents(client_id, created_at desc);
create index if not exists portal_document_folders_client_idx on portal_document_folders(client_id, parent_folder_id, name);
create index if not exists portal_documents_folder_idx on portal_documents(client_id, folder_id);
create index if not exists portal_projects_client_idx on portal_projects(client_id, status);
create index if not exists portal_tasks_client_idx on portal_tasks(client_id, status, due_date);
create index if not exists portal_tasks_project_story_idx on portal_tasks(client_id, project_id, user_story_id);
create index if not exists portal_timeline_client_idx on portal_timeline_events(client_id, created_at desc);
create index if not exists portal_audit_client_idx on portal_audit_logs(client_id, created_at desc);
create index if not exists portal_chunks_client_idx on portal_knowledge_chunks(client_id);
create index if not exists portal_tour_steps_client_idx on portal_tour_steps(client_id, sort_order);
create index if not exists portal_calendar_events_time_idx on portal_calendar_events(event_at);

alter table portal_clients enable row level security;
alter table portal_users enable row level security;
alter table portal_documents enable row level security;
alter table portal_document_folders enable row level security;
alter table portal_document_versions enable row level security;
alter table portal_document_notes enable row level security;
alter table portal_business_knowledge enable row level security;
alter table portal_knowledge_chunks enable row level security;
alter table portal_workflows enable row level security;
alter table portal_projects enable row level security;
alter table portal_tasks enable row level security;
alter table portal_timeline_events enable row level security;
alter table portal_audit_logs enable row level security;

-- Service-role API routes bypass RLS. These policies are for future direct Supabase clients.
do $$
declare
  t text;
begin
  foreach t in array array[
    'portal_clients','portal_users','portal_documents','portal_document_folders','portal_document_versions','portal_document_notes',
    'portal_business_knowledge','portal_knowledge_chunks','portal_workflows','portal_projects','portal_tasks',
    'portal_timeline_events','portal_audit_logs'
  ]
  loop
    execute format('drop policy if exists "%s service role all" on %I', t, t);
    execute format('create policy "%s service role all" on %I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')', t, t);
  end loop;
end $$;


-- =========================================================================
-- 20260526000100_client_portal_meeting_automation.sql
-- =========================================================================
-- Adds online meeting and Scout live-notes fields to existing client portal databases.
-- Run this once in the Supabase SQL editor if you already ran client_portal.sql
-- before meeting automation was added.

alter table portal_calendar_events
  add column if not exists duration_minutes int not null default 60,
  add column if not exists meeting_provider text default 'zoom',
  add column if not exists meeting_provider_id text,
  add column if not exists meeting_url text,
  add column if not exists meeting_password text,
  add column if not exists meeting_join_instructions text,
  add column if not exists scout_meeting_status text default 'scheduled',
  add column if not exists scout_live_transcript jsonb not null default '[]'::jsonb,
  add column if not exists scout_meeting_notes text,
  add column if not exists scout_key_takeaways text,
  add column if not exists scout_draft_deliverables text,
  add column if not exists scout_live_responses jsonb not null default '[]'::jsonb,
  add column if not exists scout_is_addressed boolean not null default false,
  add column if not exists scout_response_delivery text default 'voice',
  add column if not exists scout_latest_response text,
  add column if not exists scout_latest_response_at timestamptz,
  add column if not exists scout_stop_requested_at timestamptz,
  add column if not exists scout_last_summary_at timestamptz;

create index if not exists portal_calendar_events_time_idx on portal_calendar_events(event_at);


-- =========================================================================
-- 20260601000000_client_portal_permissions.sql
-- =========================================================================
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


-- =========================================================================
-- 20260727000000_website_analytics.sql
-- =========================================================================
-- Public website analytics for Conneen AI.
-- Run this in the Supabase SQL editor after client_portal.sql.
-- The app writes these rows from server-side API routes with SUPABASE_SERVICE_ROLE_KEY.

create table if not exists website_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('page_view', 'chat_message', 'lead_submission', 'client_error')),
  source text,
  page_path text,
  referrer text,
  visitor_id text,
  session_id text,
  country text,
  region text,
  city text,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists website_analytics_events_created_idx
  on website_analytics_events(created_at desc);

create index if not exists website_analytics_events_type_created_idx
  on website_analytics_events(event_type, created_at desc);

create index if not exists website_analytics_events_session_idx
  on website_analytics_events(session_id);

create index if not exists website_analytics_events_visitor_idx
  on website_analytics_events(visitor_id);

alter table website_analytics_events enable row level security;

drop policy if exists "website analytics service role all" on website_analytics_events;
create policy "website analytics service role all"
  on website_analytics_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');


-- =========================================================================
-- 20260727000100_ai_review_gates.sql
-- =========================================================================
-- AI review gates for generated commercial and client-visible portal records.
-- Existing records remain approved by default; AI-created records are inserted as pending/internal by app code.

do $$
declare
  table_name text;
  review_tables text[] := array[
    'portal_documents',
    'portal_business_knowledge',
    'portal_workflows',
    'portal_projects',
    'portal_tasks',
    'portal_decisions',
    'portal_meetings',
    'portal_timeline_events',
    'portal_requirements',
    'portal_estimates',
    'portal_payments',
    'portal_invoices',
    'portal_contracts',
    'portal_support_tickets',
    'portal_training_materials',
    'portal_handover_items',
    'portal_faqs',
    'portal_open_questions',
    'portal_notifications',
    'portal_tour_steps',
    'portal_calendar_events',
    'portal_data_requests',
    'portal_system_access',
    'portal_business_goals',
    'portal_success_metrics',
    'portal_risks',
    'portal_milestones',
    'portal_change_requests'
  ];
begin
  foreach table_name in array review_tables loop
    execute format('alter table if exists %I add column if not exists review_status text default ''approved''', table_name);
    execute format('alter table if exists %I add column if not exists review_required boolean not null default false', table_name);
    execute format('alter table if exists %I add column if not exists review_reason text', table_name);
    execute format('alter table if exists %I add column if not exists reviewed_by uuid references portal_users(id) on delete set null', table_name);
    execute format('alter table if exists %I add column if not exists reviewed_at timestamptz', table_name);
    execute format('alter table if exists %I add column if not exists generated_by text', table_name);
  end loop;
end $$;

create index if not exists portal_projects_review_idx on portal_projects (client_id, review_required, review_status);
create index if not exists portal_decisions_review_idx on portal_decisions (client_id, review_required, review_status);
create index if not exists portal_estimates_review_idx on portal_estimates (client_id, review_required, review_status);
create index if not exists portal_invoices_review_idx on portal_invoices (client_id, review_required, review_status);
create index if not exists portal_contracts_review_idx on portal_contracts (client_id, review_required, review_status);


-- =========================================================================
-- 20260727000200_meeting_transcript_idempotency.sql
-- =========================================================================
-- Idempotency/source tracking for Scout meeting transcript extraction.
-- Each generated row can be traced to the meeting event, transcript hash, run id, and per-table item key.

alter table portal_calendar_events
  add column if not exists scout_extraction_hash text,
  add column if not exists scout_extraction_run_id uuid,
  add column if not exists scout_extracted_at timestamptz;

create index if not exists portal_calendar_events_scout_extraction_hash_idx
  on portal_calendar_events (id, scout_extraction_hash);

do $$
declare
  table_name text;
  source_tables text[] := array[
    'portal_meetings',
    'portal_requirements',
    'portal_tasks',
    'portal_handover_items',
    'portal_decisions',
    'portal_open_questions',
    'portal_milestones',
    'portal_estimates',
    'portal_risks',
    'portal_success_metrics',
    'portal_data_requests',
    'portal_system_access',
    'portal_training_materials',
    'portal_change_requests',
    'portal_business_goals',
    'portal_timeline_events'
  ];
begin
  foreach table_name in array source_tables loop
    execute format('alter table if exists %I add column if not exists source_table text', table_name);
    execute format('alter table if exists %I add column if not exists source_record_id uuid', table_name);
    execute format('alter table if exists %I add column if not exists source_hash text', table_name);
    execute format('alter table if exists %I add column if not exists source_run_id uuid', table_name);
    execute format('alter table if exists %I add column if not exists source_item_key text', table_name);
    execute format(
      'create unique index if not exists %I on %I (source_record_id, source_hash, source_item_key, generated_by) where source_record_id is not null and source_hash is not null and source_item_key is not null and generated_by = ''meeting_scout''',
      table_name || '_meeting_source_once_idx',
      table_name
    );
  end loop;
end $$;


-- =========================================================================
-- 20260727000300_app_error_events.sql
-- =========================================================================
-- Structured application logging and error tracking for admin dashboards.

create table if not exists app_error_events (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'error' check (level in ('info', 'warn', 'error')),
  area text not null,
  route text,
  message text not null,
  error_name text,
  error_message text,
  error_stack text,
  client_id uuid references portal_clients(id) on delete set null,
  user_id uuid references portal_users(id) on delete set null,
  user_role text,
  country text,
  region text,
  city text,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_error_events_created_idx
  on app_error_events(created_at desc);

create index if not exists app_error_events_level_created_idx
  on app_error_events(level, created_at desc);

create index if not exists app_error_events_area_created_idx
  on app_error_events(area, created_at desc);

alter table app_error_events enable row level security;

drop policy if exists "app error events service role all" on app_error_events;
create policy "app error events service role all"
  on app_error_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
