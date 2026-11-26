-- Apply the stand-sales wizard migrations to a live-shape database as one unit.
-- Run with psql from the repository root:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/stand-sales-wizard/live-apply.sql

begin;

\i supabase/migrations/20261125183000_stand_sales_wizard.sql
insert into supabase_migrations.schema_migrations (version)
values ('20261125183000')
on conflict (version) do nothing;

\i supabase/migrations/20261125183100_auth_hook_search_path.sql
insert into supabase_migrations.schema_migrations (version)
values ('20261125183100')
on conflict (version) do nothing;

\i supabase/migrations/20261125183200_campaign_stands.sql
insert into supabase_migrations.schema_migrations (version)
values ('20261125183200')
on conflict (version) do nothing;

commit;
