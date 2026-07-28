-- Frozen migration: 20260727000300_app_error_events
-- Source: supabase/app_error_events.sql

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
