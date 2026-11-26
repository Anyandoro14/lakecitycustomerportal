-- Safety-only migration:
-- - does NOT replace public.handle_new_user()
-- - does NOT create public.handle_auth_login()
-- - only pins search_path if handle_auth_login() already exists.

do $$
begin
  if to_regprocedure('public.handle_auth_login()') is not null then
    execute 'alter function public.handle_auth_login() set search_path = public';
  end if;
end $$;
