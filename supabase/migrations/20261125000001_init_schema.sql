-- LakeCity stand sales: core schema (not yet applied to any environment).
-- Customers never read/write these tables directly: all customer actions go through edge functions
-- (service role) that check the per-lead access token. Staff read via RLS (public.is_staff()).
-- Pricing is never stored: price = USD 45 x size_sqm, incl. 15.5% VAT; USD 2,250 due at start (see campaign.ts).

create extension if not exists pgcrypto;

create type public.stand_status as enum ('available', 'paid', 'signed');
create type public.lead_stage as enum ('form_filled', 'paid', 'signed');
create type public.portal_status as enum ('not_started', 'prepopulated');

-- Staff allow-list (LakeCity internal users). Add rows manually: insert into staff_users(user_id, email) ...
create table public.staff_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff_users where user_id = auth.uid());
$$;

create table public.stands (
  stand_number text primary key,
  phase text,
  land_use text,
  size_sqm numeric check (size_sqm > 0),  -- area from the Marketing Campaign Tracker (col J)
  status public.stand_status not null default 'available',
  reserved_lead_id uuid,
  signed_lead_id uuid,
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  access_token_hash text not null,
  stage public.lead_stage not null default 'form_filled',

  -- Contact details from the stand page side pane (personal data)
  full_name text not null,
  email text not null,
  phone text not null,
  stand_number text not null references public.stands (stand_number),

  -- Offer to Purchase (General Offer Form): purchaser + co-owner identity, next of kin,
  -- acknowledgements, signature. Personal data: never logged.
  offer jsonb,
  offer_submitted_at timestamptz,
  official_use jsonb,

  -- ZikiMall payment (fixed USD 2,250 = down payment + legal fee)
  paid_at timestamptz,
  payment_reference text,
  payment_amount_cents integer check (payment_amount_cents is null or payment_amount_cents = 225000),

  -- Portal account step: records prepared by MOCK adapters (collection schedule, master schedule, Odoo)
  portal_status public.portal_status not null default 'not_started',
  portal_records jsonb,
  portal_prepopulated_at timestamptz,

  -- Agreement of Sale (parked, OI-TBC-13)
  envelope_id text unique,
  signed_at timestamptz
);

create index leads_stage_idx on public.leads (stage);

alter table public.stands
  add constraint stands_reserved_lead_fk foreign key (reserved_lead_id) references public.leads (id),
  add constraint stands_signed_lead_fk foreign key (signed_lead_id) references public.leads (id);

-- Transactional email outbox. PREVIEW MODE ONLY: rows are rendered in the outbox preview, never sent.
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  template text not null,
  to_email text not null,
  subject text not null,
  props jsonb not null,
  attachment_names text[] not null default '{}',
  status text not null default 'queued_dev_only' check (status in ('queued_dev_only', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

create table public.docusign_events (
  id uuid primary key default gen_random_uuid(),
  envelope_id text not null,
  event text not null,
  received_at timestamptz not null default now()
);

-- The three lead lists
create view public.leads_form_filled with (security_invoker = true) as
  select * from public.leads where stage = 'form_filled';
create view public.leads_paid with (security_invoker = true) as
  select * from public.leads where stage = 'paid';
create view public.leads_signed with (security_invoker = true) as
  select * from public.leads where stage = 'signed';

-- RLS ------------------------------------------------------------------------------------------
alter table public.staff_users enable row level security;
alter table public.stands enable row level security;
alter table public.leads enable row level security;
alter table public.email_outbox enable row level security;
alter table public.docusign_events enable row level security;

create policy "staff read own row" on public.staff_users for select to authenticated using (user_id = auth.uid());
create policy "anyone reads stands" on public.stands for select to anon, authenticated using (true);
create policy "staff read leads" on public.leads for select to authenticated using (public.is_staff());
create policy "staff read outbox" on public.email_outbox for select to authenticated using (public.is_staff());
create policy "staff read docusign events" on public.docusign_events for select to authenticated using (public.is_staff());

-- Staff actions ----------------------------------------------------------------------------------
create or replace function public.set_offer_official_use(p_lead_id uuid, p_official_use jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.is_staff() then
    raise exception 'not authorised';
  end if;
  select email into v_email from public.staff_users where user_id = auth.uid();
  update public.leads
     set official_use = p_official_use || jsonb_build_object('updatedBy', v_email, 'updatedAt', now()),
         updated_at = now()
   where id = p_lead_id;
end;
$$;

revoke all on function public.set_offer_official_use(uuid, jsonb) from public, anon;
grant execute on function public.set_offer_official_use(uuid, jsonb) to authenticated;

-- Server-side state transitions (service role only) ------------------------------------------------

-- Payment confirmed: stand leaves available inventory (status paid, reserved to the lead).
create or replace function public.confirm_payment(p_lead_id uuid, p_reference text, p_amount_cents integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception 'lead not found'; end if;
  if v_lead.stage <> 'form_filled' then return; end if; -- idempotent
  if v_lead.offer is null then raise exception 'offer form not completed'; end if;
  if p_amount_cents <> 225000 then raise exception 'unexpected payment amount'; end if;

  update public.stands
     set status = 'paid', reserved_lead_id = p_lead_id, updated_at = now()
   where stand_number = v_lead.stand_number and status = 'available';
  if not found then raise exception 'stand no longer available'; end if;

  update public.leads
     set stage = 'paid', paid_at = now(), payment_reference = p_reference, payment_amount_cents = p_amount_cents, updated_at = now()
   where id = p_lead_id;
end;
$$;

-- Agreement signed (DocuSign Connect envelope-completed): stand allocated to the buyer. Parked (OI-TBC-13).
create or replace function public.mark_signed(p_envelope_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
begin
  select * into v_lead from public.leads where envelope_id = p_envelope_id for update;
  if not found then return null; end if;
  if v_lead.stage = 'signed' then return v_lead.id; end if;
  if v_lead.stage <> 'paid' then raise exception 'lead not in paid stage'; end if;

  update public.stands
     set status = 'signed', signed_lead_id = v_lead.id, updated_at = now()
   where stand_number = v_lead.stand_number and reserved_lead_id = v_lead.id;

  update public.leads
     set stage = 'signed', signed_at = now(), updated_at = now()
   where id = v_lead.id;
  return v_lead.id;
end;
$$;

revoke all on function public.confirm_payment(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.mark_signed(text) from public, anon, authenticated;
grant execute on function public.confirm_payment(uuid, text, integer) to service_role;
grant execute on function public.mark_signed(text) to service_role;
