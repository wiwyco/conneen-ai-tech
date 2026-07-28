-- Frozen migration: 20260727000100_ai_review_gates
-- Source: supabase/ai_review_gates.sql

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
