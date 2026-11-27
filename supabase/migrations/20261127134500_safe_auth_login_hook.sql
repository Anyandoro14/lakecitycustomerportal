-- handle_auth_login() runs BEFORE INSERT on auth.users (migration 004).
-- Its body selects internal_users.tenant_id and profiles.tenant_id.
-- Live profiles has no tenant_id (and live tenants has name, not display_name,
-- and no spreadsheet_id). A missing column aborts createUser, so register-user
-- returns 500 and no auth.users / identities / profiles row is left behind.
-- validate-signup never inserts, so it can still succeed.
--
-- When the columns exist, the lookups stay the same. When they do not, skip
-- them and continue with a null tenant_id instead of failing the insert.

create or replace function public.handle_auth_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _tenant_id uuid;
  _role text;
  _internal_role text;
  _meta jsonb;
  _has_internal_tenant boolean;
  _has_profile_tenant boolean;
begin
  select
    to_regclass('public.internal_users') is not null
    and exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'internal_users'
         and column_name = 'tenant_id'
    )
    and exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'internal_users'
         and column_name = 'role'
    )
  into _has_internal_tenant;

  if _has_internal_tenant then
    execute
      'select iu.tenant_id, iu.role from public.internal_users iu where iu.user_id = $1 limit 1'
      into _tenant_id, _internal_role
      using new.id;
  end if;

  if _tenant_id is not null then
    _role := 'internal';
  else
    select exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'profiles'
         and column_name = 'tenant_id'
    )
    into _has_profile_tenant;

    if _has_profile_tenant then
      execute
        'select p.tenant_id from public.profiles p where p.id = $1 limit 1'
        into _tenant_id
        using new.id;
    end if;

    _role := 'customer';
    _internal_role := null;
  end if;

  _meta := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  _meta := _meta || jsonb_build_object(
    'tenant_id', _tenant_id,
    'role', _role,
    'internal_role', _internal_role
  );
  new.raw_app_meta_data := _meta;
  return new;
end;
$$;
