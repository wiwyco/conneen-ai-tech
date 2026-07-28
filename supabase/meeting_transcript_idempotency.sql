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
