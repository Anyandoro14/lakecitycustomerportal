-- Stand sales wizard schema.
-- Idempotent and self-sufficient for both:
-- 1) fresh local replay from repo migrations, and
-- 2) live-shape databases that never ran stand_inventory migrations.

create table if not exists public.stand_inventory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stand_number text not null,
  land_use text,
  area_sqm numeric(14, 2),
  phase text,
  rights text,
  status text,
  purchase_price numeric(18, 2),
  agreement_requested text,
  agreement_signed_warwickshire text,
  agreement_signed_by_client text,
  odoo_product_tmpl_id integer,
  odoo_product_id integer,
  odoo_synced_at timestamptz,
  wizard_sale_status text,
  campaign_stand boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stand_inventory
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists stand_number text,
  add column if not exists land_use text,
  add column if not exists area_sqm numeric(14, 2),
  add column if not exists phase text,
  add column if not exists rights text,
  add column if not exists status text,
  add column if not exists purchase_price numeric(18, 2),
  add column if not exists agreement_requested text,
  add column if not exists agreement_signed_warwickshire text,
  add column if not exists agreement_signed_by_client text,
  add column if not exists odoo_product_tmpl_id integer,
  add column if not exists odoo_product_id integer,
  add column if not exists odoo_synced_at timestamptz,
  add column if not exists wizard_sale_status text,
  add column if not exists campaign_stand boolean,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.stand_inventory
   set campaign_stand = false
 where campaign_stand is null;

alter table public.stand_inventory
  alter column campaign_stand set default false,
  alter column campaign_stand set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'stand_inventory_tenant_stand_unique'
       and conrelid = 'public.stand_inventory'::regclass
  ) then
    alter table public.stand_inventory
      add constraint stand_inventory_tenant_stand_unique unique (tenant_id, stand_number);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'stand_inventory_stand_number_trimmed'
       and conrelid = 'public.stand_inventory'::regclass
  ) then
    alter table public.stand_inventory
      add constraint stand_inventory_stand_number_trimmed
      check (stand_number = trim(stand_number) and stand_number <> '');
  end if;
end $$;

alter table public.stand_inventory
  drop constraint if exists stand_inventory_wizard_sale_status_check;

alter table public.stand_inventory
  add constraint stand_inventory_wizard_sale_status_check
  check (wizard_sale_status is null or wizard_sale_status in ('available', 'paid', 'signed'));

create index if not exists idx_stand_inventory_tenant
  on public.stand_inventory (tenant_id);

create index if not exists idx_stand_inventory_tenant_stand
  on public.stand_inventory (tenant_id, stand_number);

create index if not exists idx_stand_inventory_campaign_status
  on public.stand_inventory (tenant_id, campaign_stand, status);

insert into public.stand_inventory (
  tenant_id,
  stand_number,
  phase,
  land_use,
  area_sqm,
  status,
  wizard_sale_status,
  campaign_stand
)
select
  t.id,
  v.stand_number,
  v.phase,
  v.land_use,
  v.area_sqm,
  'available',
  'available',
  true
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
  stage text not null default 'contact',
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
  updated_at timestamptz not null default now()
);

alter table public.stand_sales_applications
  add column if not exists tenant_id uuid references public.tenants(id),
  add column if not exists stand_inventory_id uuid references public.stand_inventory(id),
  add column if not exists stand_number text,
  add column if not exists access_token_hash text,
  add column if not exists stage text,
  add column if not exists full_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists offer jsonb,
  add column if not exists offer_submitted_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_reference text,
  add column if not exists payment_amount_cents integer,
  add column if not exists portal_user_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'stand_sales_stage_check'
       and conrelid = 'public.stand_sales_applications'::regclass
  ) then
    alter table public.stand_sales_applications
      add constraint stand_sales_stage_check
      check (stage in ('contact', 'offer', 'paid'));
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'stand_sales_amount_fixed'
       and conrelid = 'public.stand_sales_applications'::regclass
  ) then
    alter table public.stand_sales_applications
      add constraint stand_sales_amount_fixed
      check (payment_amount_cents is null or payment_amount_cents = 225000);
  end if;
end $$;

create index if not exists stand_sales_applications_stand_idx
  on public.stand_sales_applications (tenant_id, stand_number, stage);

create unique index if not exists stand_sales_one_paid_per_stand
  on public.stand_sales_applications (tenant_id, stand_number)
  where stage = 'paid';

create table if not exists public.stand_sales_payment_attempts (
  reference text primary key,
  application_id uuid not null references public.stand_sales_applications(id) on delete cascade,
  stand_number text not null,
  amount_cents integer not null,
  nonce text not null,
  merchant_reference text not null,
  status text not null default 'started',
  card_status integer,
  dismissed_at timestamptz,
  dismissed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stand_sales_payment_attempts
  add column if not exists application_id uuid references public.stand_sales_applications(id) on delete cascade,
  add column if not exists stand_number text,
  add column if not exists amount_cents integer,
  add column if not exists nonce text,
  add column if not exists merchant_reference text,
  add column if not exists status text,
  add column if not exists card_status integer,
  add column if not exists dismissed_at timestamptz,
  add column if not exists dismissed_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'stand_sales_attempt_amount_check'
       and conrelid = 'public.stand_sales_payment_attempts'::regclass
  ) then
    alter table public.stand_sales_payment_attempts
      add constraint stand_sales_attempt_amount_check
      check (amount_cents = 225000);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'stand_sales_attempt_status_check'
       and conrelid = 'public.stand_sales_payment_attempts'::regclass
  ) then
    alter table public.stand_sales_payment_attempts
      add constraint stand_sales_attempt_status_check
      check (status in ('started', 'approved', 'declined', 'cancelled', 'retry_later', 'pending', 'error', 'dismissed'));
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'stand_sales_attempt_merchant_ref'
       and conrelid = 'public.stand_sales_payment_attempts'::regclass
  ) then
    alter table public.stand_sales_payment_attempts
      add constraint stand_sales_attempt_merchant_ref
      check (merchant_reference = reference);
  end if;
end $$;

create index if not exists stand_sales_attempts_app_idx
  on public.stand_sales_payment_attempts (application_id, created_at);

create table if not exists public.stand_sales_payment_events (
  reference text primary key,
  stand_number text not null,
  application_id uuid references public.stand_sales_applications(id) on delete set null,
  amount_cents integer not null,
  source text not null,
  outcome text not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.stand_sales_payment_events
  add column if not exists stand_number text,
  add column if not exists application_id uuid references public.stand_sales_applications(id) on delete set null,
  add column if not exists amount_cents integer,
  add column if not exists source text,
  add column if not exists outcome text,
  add column if not exists reason text,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'stand_sales_events_source_check'
       and conrelid = 'public.stand_sales_payment_events'::regclass
  ) then
    alter table public.stand_sales_payment_events
      add constraint stand_sales_events_source_check
      check (source in ('iveri', 'mock-iveri'));
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'stand_sales_events_outcome_check'
       and conrelid = 'public.stand_sales_payment_events'::regclass
  ) then
    alter table public.stand_sales_payment_events
      add constraint stand_sales_events_outcome_check
      check (outcome in ('applied', 'rejected', 'unmatched'));
  end if;
end $$;

create table if not exists public.stand_sales_email_outbox (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.stand_sales_applications(id) on delete cascade,
  template text not null,
  to_email text not null,
  subject text not null,
  html text not null,
  status text not null default 'queued_dev_only',
  created_at timestamptz not null default now()
);

alter table public.stand_sales_email_outbox
  add column if not exists application_id uuid references public.stand_sales_applications(id) on delete cascade,
  add column if not exists template text,
  add column if not exists to_email text,
  add column if not exists subject text,
  add column if not exists html text,
  add column if not exists status text,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'stand_sales_email_status_check'
       and conrelid = 'public.stand_sales_email_outbox'::regclass
  ) then
    alter table public.stand_sales_email_outbox
      add constraint stand_sales_email_status_check
      check (status in ('queued_dev_only'));
  end if;
end $$;

create or replace function public.stand_sales_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stand_sales_applications_updated on public.stand_sales_applications;
create trigger trg_stand_sales_applications_updated
  before update on public.stand_sales_applications
  for each row execute function public.stand_sales_touch_updated_at();

drop trigger if exists trg_stand_sales_attempts_updated on public.stand_sales_payment_attempts;
create trigger trg_stand_sales_attempts_updated
  before update on public.stand_sales_payment_attempts
  for each row execute function public.stand_sales_touch_updated_at();

alter table public.stand_inventory enable row level security;
alter table public.stand_sales_applications enable row level security;
alter table public.stand_sales_payment_attempts enable row level security;
alter table public.stand_sales_payment_events enable row level security;
alter table public.stand_sales_email_outbox enable row level security;

drop policy if exists "staff read stand sales applications" on public.stand_sales_applications;
do $$
begin
  if to_regprocedure('public.is_internal_user(uuid)') is not null then
    execute $policy$
      create policy "staff read stand sales applications"
      on public.stand_sales_applications for select to authenticated
      using (public.is_internal_user(auth.uid()))
    $policy$;
  else
    execute $policy$
      create policy "staff read stand sales applications"
      on public.stand_sales_applications for select to authenticated
      using (false)
    $policy$;
  end if;
end $$;

drop policy if exists "staff read stand sales attempts" on public.stand_sales_payment_attempts;
do $$
begin
  if to_regprocedure('public.is_internal_user(uuid)') is not null then
    execute $policy$
      create policy "staff read stand sales attempts"
      on public.stand_sales_payment_attempts for select to authenticated
      using (public.is_internal_user(auth.uid()))
    $policy$;
  else
    execute $policy$
      create policy "staff read stand sales attempts"
      on public.stand_sales_payment_attempts for select to authenticated
      using (false)
    $policy$;
  end if;
end $$;

drop policy if exists "staff read stand sales events" on public.stand_sales_payment_events;
do $$
begin
  if to_regprocedure('public.is_internal_user(uuid)') is not null then
    execute $policy$
      create policy "staff read stand sales events"
      on public.stand_sales_payment_events for select to authenticated
      using (public.is_internal_user(auth.uid()))
    $policy$;
  else
    execute $policy$
      create policy "staff read stand sales events"
      on public.stand_sales_payment_events for select to authenticated
      using (false)
    $policy$;
  end if;
end $$;

drop policy if exists "staff read stand sales outbox" on public.stand_sales_email_outbox;
do $$
begin
  if to_regprocedure('public.is_internal_user(uuid)') is not null then
    execute $policy$
      create policy "staff read stand sales outbox"
      on public.stand_sales_email_outbox for select to authenticated
      using (public.is_internal_user(auth.uid()))
    $policy$;
  else
    execute $policy$
      create policy "staff read stand sales outbox"
      on public.stand_sales_email_outbox for select to authenticated
      using (false)
    $policy$;
  end if;
end $$;

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
