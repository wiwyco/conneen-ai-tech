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
