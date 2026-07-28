# Supabase Schema Freeze

This folder keeps the production database schema in a frozen, deployable order.

## Apply Order

Run the SQL files in `supabase/migrations/` in filename order, or run the combined file:

```text
supabase/schema_freeze.sql
```

The SQL is written to be re-runnable with `create table if not exists`, `alter table ... add column if not exists`, `create index if not exists`, and policy replacement where needed.

Do not run `client_portal_seed_admin.sql` as part of the schema freeze. Prefer the `/api/portal/bootstrap-admin` endpoint with `PORTAL_BOOTSTRAP_SECRET` for admin creation.

## Freeze Check

When a Supabase SQL source file changes, refresh the frozen migrations:

```powershell
npm run freeze:supabase
```

Before deployment, verify the freeze:

```powershell
npm run check:supabase-freeze
```

`schema_manifest.json` stores SHA-256 checksums for each source, frozen migration, and the combined schema freeze.
