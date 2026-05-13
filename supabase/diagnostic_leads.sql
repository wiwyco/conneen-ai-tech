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
