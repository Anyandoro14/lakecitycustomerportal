-- Edge functions (sync-stand-portal-settings, odoo-webhook, odoo-loan-http,
-- odoo-ensure-contract) call rpc('vault_read_secret'), but the function was
-- never created, so every Vault lookup failed. Service role only.
create or replace function public.vault_read_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1;
$$;

revoke all on function public.vault_read_secret(text) from public;
revoke all on function public.vault_read_secret(text) from anon;
revoke all on function public.vault_read_secret(text) from authenticated;
grant execute on function public.vault_read_secret(text) to service_role;
