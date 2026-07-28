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
