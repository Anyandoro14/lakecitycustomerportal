-- Stand sales wizard tables.
-- NOT applied to the live project (gumkxjeahojrcaqnosyz). Local Supabase only until Alex says otherwise.
-- Reconciles with the existing public.stand_inventory register: does not recreate it, does not
-- overwrite a stand that is already there, and keeps the official status text. Wizard sale state
-- lives in wizard_sale_status plus the stand_sales_* tables below.

alter table public.stand_inventory
  add column if not exists wizard_sale_status text;

alter table public.stand_inventory
  drop constraint if exists stand_inventory_wizard_sale_status_check;

alter table public.stand_inventory
  add constraint stand_inventory_wizard_sale_status_check
  check (wizard_sale_status is null or wizard_sale_status in ('available', 'paid', 'signed'));

insert into public.stand_inventory (tenant_id, stand_number, phase, land_use, area_sqm, status)
select t.id, v.stand_number, v.phase, v.land_use, v.area_sqm, 'Available'
from public.tenants t
join (values
  ('3567', 'M', 'Residential', 1200),
  ('3076', 'Q', 'Residential', 1622),
  ('3034', 'K', 'Residential', 1794),
  ('3035', 'K', 'Residential', 1795),
  ('3061', 'K', 'Residential', 1796),
  ('3060', 'K', 'Residential', 1798),
  ('3056', 'K', 'Residential', 1891),
  ('3057', 'K', 'Residential', 1892),
  ('3058', 'K', 'Residential', 1893),
  ('3059', 'K', 'Residential', 1894),
  ('3036', 'K', 'Residential', 1897),
  ('3037', 'K', 'Residential', 1899),
  ('3038', 'K', 'Residential', 1900),
  ('3039', 'K', 'Residential', 1901),
  ('3049', 'K', 'Residential', 1983),
  ('3050', 'K', 'Residential', 1985),
  ('3051', 'K', 'Residential', 1986),
  ('3052', 'K', 'Residential', 1987),
  ('3053', 'K', 'Residential', 1988),
  ('3054', 'K', 'Residential', 1989),
  ('3055', 'K', 'Residential', 1990),
  ('3075', 'Q', 'Residential', 2000),
  ('3043', 'K', 'Residential', 2001),
  ('3041', 'K', 'Residential', 2002),
  ('3044', 'K', 'Residential', 2002),
  ('3040', 'K', 'Residential', 2003),
  ('3042', 'K', 'Residential', 2003),
  ('3045', 'K', 'Residential', 2003),
  ('3046', 'K', 'Residential', 2003),
  ('3062', 'K', 'Residential', 2057),
  ('3048', 'K', 'Residential', 2085),
  ('3047', 'K', 'Residential', 2110),
  ('3033', 'K', 'Residential', 2255),
  ('3093', 'Q', 'Residential', 2470),
  ('3089', 'Q', 'Residential', 2514),
  ('3095', 'Q', 'Residential', 2676),
  ('3096', 'Q', 'Residential', 2971),
  ('3084', 'Q', 'Residential', 3288)
) as v(stand_number, phase, land_use, area_sqm) on true
where t.slug = 'lakecity'
on conflict (tenant_id, stand_number) do nothing;

create table if not exists public.stand_sales_applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  stand_inventory_id uuid not null references public.stand_inventory(id),
  stand_number text not null,
  access_token_hash text not null,
  stage text not null default 'contact' check (stage in ('contact', 'offer', 'paid')),
  full_name text not null,
  email text not null,
  phone text not null,
  offer jsonb,
  offer_submitted_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  payment_amount_cents integer,
  portal_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stand_sales_amount_fixed check (payment_amount_cents is null or payment_amount_cents = 225000)
);

create index if not exists stand_sales_applications_stand_idx
  on public.stand_sales_applications (tenant_id, stand_number, stage);

create unique index if not exists stand_sales_one_paid_per_stand
  on public.stand_sales_applications (tenant_id, stand_number)
  where stage = 'paid';

create table if not exists public.stand_sales_payment_attempts (
  reference text primary key,
  application_id uuid not null references public.stand_sales_applications(id) on delete cascade,
  stand_number text not null,
  amount_cents integer not null check (amount_cents = 225000),
  nonce text not null,
  merchant_reference text not null,
  status text not null default 'started'
    check (status in ('started', 'approved', 'declined', 'cancelled', 'retry_later', 'pending', 'error', 'dismissed')),
  card_status integer,
  dismissed_at timestamptz,
  dismissed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stand_sales_attempt_merchant_ref check (merchant_reference = reference)
);

create index if not exists stand_sales_attempts_app_idx
  on public.stand_sales_payment_attempts (application_id, created_at);

create table if not exists public.stand_sales_payment_events (
  reference text primary key,
  stand_number text not null,
  application_id uuid references public.stand_sales_applications(id) on delete set null,
  amount_cents integer not null,
  source text not null check (source in ('iveri', 'mock-iveri')),
  outcome text not null check (outcome in ('applied', 'rejected', 'unmatched')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.stand_sales_email_outbox (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.stand_sales_applications(id) on delete cascade,
  template text not null,
  to_email text not null,
  subject text not null,
  html text not null,
  status text not null default 'queued_dev_only' check (status in ('queued_dev_only')),
  created_at timestamptz not null default now()
);

drop trigger if exists trg_stand_sales_applications_updated on public.stand_sales_applications;
create trigger trg_stand_sales_applications_updated
  before update on public.stand_sales_applications
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_stand_sales_attempts_updated on public.stand_sales_payment_attempts;
create trigger trg_stand_sales_attempts_updated
  before update on public.stand_sales_payment_attempts
  for each row execute function public.handle_updated_at();

alter table public.stand_sales_applications enable row level security;
alter table public.stand_sales_payment_attempts enable row level security;
alter table public.stand_sales_payment_events enable row level security;
alter table public.stand_sales_email_outbox enable row level security;

drop policy if exists "staff read stand sales applications" on public.stand_sales_applications;
create policy "staff read stand sales applications"
  on public.stand_sales_applications for select to authenticated
  using (public.is_internal_user(auth.uid()));

drop policy if exists "staff read stand sales attempts" on public.stand_sales_payment_attempts;
create policy "staff read stand sales attempts"
  on public.stand_sales_payment_attempts for select to authenticated
  using (public.is_internal_user(auth.uid()));

drop policy if exists "staff read stand sales events" on public.stand_sales_payment_events;
create policy "staff read stand sales events"
  on public.stand_sales_payment_events for select to authenticated
  using (public.is_internal_user(auth.uid()));

drop policy if exists "staff read stand sales outbox" on public.stand_sales_email_outbox;
create policy "staff read stand sales outbox"
  on public.stand_sales_email_outbox for select to authenticated
  using (public.is_internal_user(auth.uid()));

-- Confirms a card payment only when the caller (the edge function, after AuthoriseInfo) passes
-- amount 225000, the merchant reference and the LC_Nonce stored on the attempt. Idempotent per reference.
create or replace function public.apply_stand_sales_payment(
  p_reference text,
  p_merchant_reference text,
  p_nonce text,
  p_stand_number text,
  p_application_id uuid,
  p_amount_cents integer,
  p_paid_at timestamptz,
  p_source text,
  p_email_to text,
  p_email_subject text,
  p_email_html text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.stand_sales_applications%rowtype;
  v_nonce text;
  v_recorded text;
begin
  insert into public.stand_sales_payment_events (reference, stand_number, application_id, amount_cents, source, outcome)
  values (p_reference, p_stand_number, p_application_id, p_amount_cents, p_source, 'applied')
  on conflict (reference) do nothing;
  if not found then
    select case when outcome = 'applied' then 'duplicate' else outcome || coalesce(':' || reason, '') end
      into v_recorded
      from public.stand_sales_payment_events
     where reference = p_reference;
    return coalesce(v_recorded, 'duplicate');
  end if;

  if p_amount_cents is distinct from 225000 then
    update public.stand_sales_payment_events set outcome = 'rejected', reason = 'amount' where reference = p_reference;
    update public.stand_sales_payment_attempts
       set status = 'error', card_status = 0, updated_at = now()
     where reference = p_reference and status <> 'approved';
    return 'rejected:amount';
  end if;

  if p_merchant_reference is distinct from p_reference then
    update public.stand_sales_payment_events set outcome = 'rejected', reason = 'merchant_reference' where reference = p_reference;
    update public.stand_sales_payment_attempts
       set status = 'error', card_status = 0, updated_at = now()
     where reference = p_reference and status <> 'approved';
    return 'rejected:merchant_reference';
  end if;

  select nonce into v_nonce from public.stand_sales_payment_attempts where reference = p_reference;
  if v_nonce is null or p_nonce is distinct from v_nonce then
    update public.stand_sales_payment_events set outcome = 'rejected', reason = 'nonce' where reference = p_reference;
    update public.stand_sales_payment_attempts
       set status = 'error', card_status = 0, updated_at = now()
     where reference = p_reference and status <> 'approved';
    return 'rejected:nonce';
  end if;

  select * into v_app from public.stand_sales_applications where id = p_application_id for update;
  if not found or v_app.stand_number is distinct from p_stand_number then
    update public.stand_sales_payment_events set outcome = 'unmatched', reason = 'not_awaiting' where reference = p_reference;
    update public.stand_sales_payment_attempts
       set status = 'error', card_status = 0, updated_at = now()
     where reference = p_reference and status <> 'approved';
    return 'unmatched:not_awaiting';
  end if;

  if v_app.stage = 'paid' then
    update public.stand_sales_payment_events set outcome = 'unmatched', reason = 'already_paid' where reference = p_reference;
    update public.stand_sales_payment_attempts
       set status = 'error', card_status = 0, updated_at = now()
     where reference = p_reference and status <> 'approved';
    return 'unmatched:already_paid';
  end if;

  if v_app.offer is null or v_app.stage <> 'offer' then
    update public.stand_sales_payment_events set outcome = 'unmatched', reason = 'not_awaiting' where reference = p_reference;
    update public.stand_sales_payment_attempts
       set status = 'error', card_status = 0, updated_at = now()
     where reference = p_reference and status <> 'approved';
    return 'unmatched:not_awaiting';
  end if;

  update public.stand_inventory
     set wizard_sale_status = 'paid', updated_at = now()
   where id = v_app.stand_inventory_id
     and (wizard_sale_status is null or wizard_sale_status = 'available');
  if not found then
    update public.stand_sales_payment_events set outcome = 'unmatched', reason = 'stand_not_available' where reference = p_reference;
    update public.stand_sales_payment_attempts
       set status = 'error', card_status = 0, updated_at = now()
     where reference = p_reference and status <> 'approved';
    return 'unmatched:stand_not_available';
  end if;

  update public.stand_sales_applications
     set stage = 'paid',
         paid_at = p_paid_at,
         payment_reference = p_reference,
         payment_amount_cents = 225000,
         updated_at = now()
   where id = p_application_id;

  update public.stand_sales_payment_attempts
     set status = 'approved', card_status = 0, updated_at = now()
   where reference = p_reference;

  insert into public.stand_sales_email_outbox (application_id, template, to_email, subject, html)
  values (p_application_id, 'payment_thank_you', p_email_to, p_email_subject, p_email_html);

  return 'applied';
end;
$$;

revoke all on function public.apply_stand_sales_payment(text, text, text, text, uuid, integer, timestamptz, text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_stand_sales_payment(text, text, text, text, uuid, integer, timestamptz, text, text, text, text) to service_role;
