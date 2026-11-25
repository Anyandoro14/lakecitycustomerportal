-- LakeCity stand sales: core schema.
-- Customers never read/write these tables directly: all customer actions go through edge functions
-- (service role) that check the per-lead access token. Staff read via RLS (public.is_staff()).

create extension if not exists pgcrypto;

create type public.stand_status as enum ('available', 'paid', 'signed');
create type public.lead_stage as enum ('form_filled', 'paid', 'signed');
create type public.id_review_status as enum ('id_pending_review', 'approved', 'rejected');
create type public.id_type as enum ('national_id', 'passport');
create type public.portal_status as enum ('not_created', 'created', 'activated');

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
  size_sqm numeric,            -- TBC
  price_usd numeric(12, 2),    -- TBC, VAT inclusive
  deposit_usd numeric(12, 2),  -- TBC
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

  -- Buyer (personal data)
  full_name text not null,
  date_of_birth date not null,
  email text not null,
  phone text not null,
  physical_address text not null,
  postal_address text not null,
  country char(2) not null,
  id_type public.id_type not null,
  id_issuing_country char(2) not null,
  id_number text not null,
  id_expiry date,
  id_front_path text,
  id_back_path text,

  -- Manual ID review gate
  id_review_status public.id_review_status not null default 'id_pending_review',
  id_review_reason text,
  id_reviewed_by text,
  id_reviewed_at timestamptz,

  stand_number text not null references public.stands (stand_number),

  -- Offer to Purchase (General Offer Form) incl. next of kin, acknowledgements, signature
  offer jsonb,
  offer_submitted_at timestamptz,
  official_use jsonb,

  schedule_accepted_at timestamptz,

  paid_at timestamptz,
  payment_reference text,

  collection_account_id text unique,
  collection_account_created_at timestamptz,

  portal_status public.portal_status not null default 'not_created',
  portal_user_id uuid,
  portal_created_at timestamptz,
  portal_activated_at timestamptz,

  envelope_id text unique,
  signed_at timestamptz
);

create index leads_stage_idx on public.leads (stage);
create index leads_review_idx on public.leads (id_review_status);

alter table public.stands
  add constraint stands_reserved_lead_fk foreign key (reserved_lead_id) references public.leads (id),
  add constraint stands_signed_lead_fk foreign key (signed_lead_id) references public.leads (id);

create table public.co_owners (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  position int not null check (position between 1 and 3),
  full_name text not null,
  date_of_birth date not null,
  email text not null,
  phone text not null,
  id_type public.id_type not null,
  id_issuing_country char(2) not null,
  id_number text not null,
  id_expiry date,
  id_front_path text,
  id_back_path text,
  unique (lead_id, position)
);

create table public.id_review_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected')),
  reason text,
  reviewer text not null,
  reviewer_user_id uuid,
  created_at timestamptz not null default now()
);

-- Transactional email outbox. DEV MODE ONLY: rows are rendered in the outbox preview, never sent.
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
alter table public.co_owners enable row level security;
alter table public.id_review_log enable row level security;
alter table public.email_outbox enable row level security;
alter table public.docusign_events enable row level security;

create policy "staff read own row" on public.staff_users for select to authenticated using (user_id = auth.uid());
create policy "anyone reads stands" on public.stands for select to anon, authenticated using (true);
create policy "staff read leads" on public.leads for select to authenticated using (public.is_staff());
create policy "staff read co_owners" on public.co_owners for select to authenticated using (public.is_staff());
create policy "staff read review log" on public.id_review_log for select to authenticated using (public.is_staff());
create policy "staff read outbox" on public.email_outbox for select to authenticated using (public.is_staff());
create policy "staff read docusign events" on public.docusign_events for select to authenticated using (public.is_staff());

-- Staff actions ----------------------------------------------------------------------------------
create or replace function public.review_id(p_lead_id uuid, p_decision text, p_reason text)
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
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision';
  end if;
  if p_decision = 'rejected' and coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required when rejecting';
  end if;
  select email into v_email from public.staff_users where user_id = auth.uid();

  update public.leads
     set id_review_status = p_decision::public.id_review_status,
         id_review_reason = nullif(trim(p_reason), ''),
         id_reviewed_by = v_email,
         id_reviewed_at = now(),
         updated_at = now()
   where id = p_lead_id and stage = 'form_filled';
  if not found then
    raise exception 'lead not found or already paid';
  end if;

  insert into public.id_review_log (lead_id, decision, reason, reviewer, reviewer_user_id)
  values (p_lead_id, p_decision, nullif(trim(p_reason), ''), v_email, auth.uid());
end;
$$;

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

revoke all on function public.review_id(uuid, text, text) from public, anon;
revoke all on function public.set_offer_official_use(uuid, jsonb) from public, anon;
grant execute on function public.review_id(uuid, text, text) to authenticated;
grant execute on function public.set_offer_official_use(uuid, jsonb) to authenticated;

-- Server-side state transitions (service role only) ------------------------------------------------

-- Payment confirmed: stand leaves available inventory (status paid, reserved to the lead).
create or replace function public.confirm_payment(p_lead_id uuid, p_reference text)
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
  if v_lead.id_review_status <> 'approved' then raise exception 'ID not approved'; end if;
  if v_lead.schedule_accepted_at is null then raise exception 'offer/schedule not completed'; end if;

  update public.stands
     set status = 'paid', reserved_lead_id = p_lead_id, updated_at = now()
   where stand_number = v_lead.stand_number and status = 'available';
  if not found then raise exception 'stand no longer available'; end if;

  update public.leads
     set stage = 'paid', paid_at = now(), payment_reference = p_reference, updated_at = now()
   where id = p_lead_id;
end;
$$;

-- Agreement signed (DocuSign Connect envelope-completed): stand allocated to the buyer.
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

revoke all on function public.confirm_payment(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_signed(text) from public, anon, authenticated;
grant execute on function public.confirm_payment(uuid, text) to service_role;
grant execute on function public.mark_signed(text) to service_role;

-- Private storage for ID images. No public URLs; staff get short-lived signed URLs via RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('id-documents', 'id-documents', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false;

create policy "staff read id documents" on storage.objects for select to authenticated
  using (bucket_id = 'id-documents' and public.is_staff());
