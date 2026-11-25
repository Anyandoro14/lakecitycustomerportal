-- Automatic payment confirmation (Alex, 2026-11-25) and stand number as the unique key (OI-TBC-15/16/17).
-- The confirmation source (webhook, API or bank feed) is TBC (OI-TBC-30); only a mock adapter feeds this.

-- One row per ZikiMall/CBZ payment reference: the idempotency key for the payment-confirmed handler.
create table public.payment_events (
  reference text primary key,
  stand_number text not null,
  lead_id uuid references public.leads (id) on delete set null,
  amount_cents integer not null,
  source text not null check (source in ('mock')),
  outcome text not null check (outcome in ('applied', 'rejected', 'unmatched')),
  created_at timestamptz not null default now()
);
create index payment_events_stand_idx on public.payment_events (stand_number);
alter table public.payment_events enable row level security;
create policy "staff read payment events" on public.payment_events for select to authenticated using (public.is_staff());

-- At most one paid (or signed) lead and one portal enrolment per stand number.
create unique index leads_one_paid_per_stand on public.leads (stand_number) where stage <> 'form_filled';
create unique index leads_one_portal_per_stand on public.leads (stand_number) where portal_status = 'prepopulated';

-- Superseded by apply_payment_confirmed (automatic, idempotent per reference).
drop function if exists public.confirm_payment(uuid, text, integer);

-- Payment confirmed: ONE transaction records the reference, takes the stand out of available inventory,
-- marks the lead paid and queues the thank-you email (preview outbox). Returns 'applied' or 'duplicate'.
create or replace function public.apply_payment_confirmed(
  p_reference text,
  p_stand_number text,
  p_lead_id uuid,
  p_amount_cents integer,
  p_paid_at timestamptz,
  p_source text,
  p_email_to text,
  p_email_subject text,
  p_email_props jsonb,
  p_email_attachments text[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
begin
  insert into public.payment_events (reference, stand_number, lead_id, amount_cents, source, outcome)
  values (p_reference, p_stand_number, p_lead_id, p_amount_cents, p_source, 'applied')
  on conflict (reference) do nothing;
  if not found then return 'duplicate'; end if;

  if p_amount_cents <> 225000 then raise exception 'unexpected payment amount'; end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception 'lead not found'; end if;
  if v_lead.stand_number <> p_stand_number then raise exception 'stand number does not match the lead'; end if;
  if v_lead.offer is null or v_lead.stage <> 'form_filled' then raise exception 'lead is not awaiting payment'; end if;

  update public.stands
     set status = 'paid', reserved_lead_id = p_lead_id, updated_at = now()
   where stand_number = p_stand_number and status = 'available';
  if not found then raise exception 'stand no longer available'; end if;

  update public.leads
     set stage = 'paid', paid_at = p_paid_at, payment_reference = p_reference, payment_amount_cents = p_amount_cents, updated_at = now()
   where id = p_lead_id;

  insert into public.email_outbox (lead_id, template, to_email, subject, props, attachment_names)
  values (p_lead_id, 'payment_thank_you', p_email_to, p_email_subject, p_email_props, coalesce(p_email_attachments, '{}'));

  return 'applied';
end;
$$;

revoke all on function public.apply_payment_confirmed(text, text, uuid, integer, timestamptz, text, text, text, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.apply_payment_confirmed(text, text, uuid, integer, timestamptz, text, text, text, jsonb, text[]) to service_role;
