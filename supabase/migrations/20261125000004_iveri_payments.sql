-- iVeri Lite card payments (Alex, 2026-11-25). Only an iVeri AuthoriseInfo card status 0 reaches
-- apply_payment_confirmed. Every payment reference is recorded once in payment_events, including payments
-- that cannot be applied (stand already sold, lead already paid, wrong amount), so staff can refund them.

-- One row per card payment attempt. The merchant reference (stand number + per-attempt suffix) is the
-- Lite_Merchant_Trace sent to iVeri and the key used to ask AuthoriseInfo for the result.
create table public.payment_attempts (
  reference text primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  stand_number text not null,
  amount_cents integer not null check (amount_cents = 225000),
  status text not null default 'started'
    check (status in ('started', 'approved', 'declined', 'cancelled', 'retry_later', 'pending', 'error')),
  card_status integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_attempts_lead_idx on public.payment_attempts (lead_id, created_at desc);
alter table public.payment_attempts enable row level security;
create policy "staff read payment attempts" on public.payment_attempts for select to authenticated using (public.is_staff());

alter table public.payment_events drop constraint payment_events_source_check;
alter table public.payment_events add constraint payment_events_source_check check (source in ('iveri', 'mock-iveri'));
alter table public.payment_events add column reason text;

-- Payment confirmed (card status 0). ONE transaction: the reference is recorded first. A repeat changes
-- nothing and returns 'duplicate' if the reference was applied, otherwise its recorded outcome again. If the payment can't be applied it stays recorded as 'unmatched' or
-- 'rejected' and nothing else changes. Otherwise the stand leaves available inventory, the lead is marked
-- paid, the attempt is marked approved and the thank-you email is queued in the preview outbox.
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
  v_recorded text;
begin
  insert into public.payment_events (reference, stand_number, lead_id, amount_cents, source, outcome)
  values (p_reference, p_stand_number, (select id from public.leads where id = p_lead_id), p_amount_cents, p_source, 'applied')
  on conflict (reference) do nothing;
  if not found then
    select outcome into v_recorded from public.payment_events where reference = p_reference;
    return case when v_recorded = 'applied' then 'duplicate' else v_recorded end;
  end if;

  if p_amount_cents <> 225000 then
    update public.payment_events set outcome = 'rejected', reason = 'amount' where reference = p_reference;
    return 'rejected';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found or v_lead.stand_number <> p_stand_number or v_lead.offer is null or v_lead.stage <> 'form_filled' then
    update public.payment_events set outcome = 'unmatched', reason = 'lead_not_awaiting_payment' where reference = p_reference;
    return 'unmatched';
  end if;

  update public.stands
     set status = 'paid', reserved_lead_id = p_lead_id, updated_at = now()
   where stand_number = p_stand_number and status = 'available';
  if not found then
    update public.payment_events set outcome = 'unmatched', reason = 'stand_not_available' where reference = p_reference;
    return 'unmatched';
  end if;

  update public.leads
     set stage = 'paid', paid_at = p_paid_at, payment_reference = p_reference, payment_amount_cents = p_amount_cents, updated_at = now()
   where id = p_lead_id;

  update public.payment_attempts
     set status = 'approved', card_status = 0, updated_at = now()
   where reference = p_reference;

  insert into public.email_outbox (lead_id, template, to_email, subject, props, attachment_names)
  values (p_lead_id, 'payment_thank_you', p_email_to, p_email_subject, p_email_props, coalesce(p_email_attachments, '{}'));

  return 'applied';
end;
$$;

revoke all on function public.apply_payment_confirmed(text, text, uuid, integer, timestamptz, text, text, text, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.apply_payment_confirmed(text, text, uuid, integer, timestamptz, text, text, text, jsonb, text[]) to service_role;
