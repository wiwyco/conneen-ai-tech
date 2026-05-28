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
