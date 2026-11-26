-- Safety-only migration:
-- - does NOT replace public.handle_new_user()
-- - does NOT create public.handle_auth_login()
-- - only pins search_path if handle_auth_login() already exists.
-- - when profiles.tenant_id exists (repo replay), adds a default so legacy
--   handle_new_user() inserts keep working without rewriting the function body.

do $$
begin
  if to_regprocedure('public.handle_auth_login()') is not null then
    execute 'alter function public.handle_auth_login() set search_path = public';
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'profiles'
       and column_name = 'tenant_id'
  ) then
    execute $fn$
      create or replace function public.default_lakecity_tenant_id()
      returns uuid
      language sql
      stable
      security definer
      set search_path = public
      as $sql$
        select id
          from public.tenants
         where slug = 'lakecity'
         limit 1
      $sql$
    $fn$;

    execute 'alter table public.profiles alter column tenant_id set default public.default_lakecity_tenant_id()';
  end if;
end $$;
