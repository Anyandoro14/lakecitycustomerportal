-- Additive Agreement of Sale columns for the stand-sales wizard.
-- Do not apply this file to the live Supabase project from application code.
-- Expands wizard_sale_status. Does not remove available, paid, or signed, and does not rewrite rows.
-- Does not change stand_sales_applications.stage or stand_sales_email_outbox status values.
-- Buyer reads stay on the edge function (access token or the signed-in portal user for that stand).
-- Staff writes stay on the edge function after the LakeCity staff check. No new buyer write policies.

alter table public.stand_inventory
  drop constraint if exists stand_inventory_wizard_sale_status_check;

alter table public.stand_inventory
  add constraint stand_inventory_wizard_sale_status_check
  check (
    wizard_sale_status is null
    or wizard_sale_status in (
      'available',
      'paid',
      'signed',
      'awaiting_agreement',
      'agreement_sent_wet_signature',
      'signed_original_received'
    )
  );

alter table public.stand_sales_applications
  add column if not exists agreement_status text not null default 'pending_review',
  add column if not exists agreement_execution_method text,
  add column if not exists agreement_region text,
  add column if not exists agreement_acknowledged_at timestamptz,
  add column if not exists agreement_courier jsonb,
  add column if not exists agreement_domicilium jsonb,
  add column if not exists agreement_witnesses jsonb,
  add column if not exists agreement_dispatched_at timestamptz,
  add column if not exists agreement_dispatch_tracking text,
  add column if not exists agreement_return_submitted_at timestamptz,
  add column if not exists agreement_return_tracking text,
  add column if not exists agreement_return_courier text,
  add column if not exists agreement_original_received_at timestamptz,
  add column if not exists agreement_countersigned_at timestamptz,
  add column if not exists agreement_action_required_at timestamptz,
  add column if not exists agreement_action_message text,
  add column if not exists agreement_document_url text,
  add column if not exists docusign_envelope_id text,
  add column if not exists docusign_status text,
  add column if not exists docusign_sent_at timestamptz;

alter table public.stand_sales_applications
  drop constraint if exists stand_sales_agreement_status_check,
  drop constraint if exists stand_sales_agreement_method_check,
  drop constraint if exists stand_sales_agreement_region_check,
  drop constraint if exists stand_sales_agreement_witnesses_check,
  drop constraint if exists stand_sales_agreement_courier_check,
  drop constraint if exists stand_sales_agreement_domicilium_check,
  drop constraint if exists stand_sales_docusign_envelope_unset,
  drop constraint if exists stand_sales_docusign_status_unset,
  drop constraint if exists stand_sales_docusign_sent_unset;

alter table public.stand_sales_applications
  add constraint stand_sales_agreement_status_check
    check (agreement_status in (
      'pending_review',
      'acknowledged',
      'dispatched',
      'return_submitted',
      'original_received',
      'countersigned',
      'action_required'
    )),
  add constraint stand_sales_agreement_method_check
    check (agreement_execution_method is null or agreement_execution_method in ('courier', 'in_person', 'docusign')),
  add constraint stand_sales_agreement_region_check
    check (agreement_region is null or agreement_region in ('domestic', 'diaspora')),
  add constraint stand_sales_agreement_witnesses_check
    check (agreement_witnesses is null or jsonb_typeof(agreement_witnesses) = 'array'),
  add constraint stand_sales_agreement_courier_check
    check (agreement_courier is null or jsonb_typeof(agreement_courier) = 'object'),
  add constraint stand_sales_agreement_domicilium_check
    check (agreement_domicilium is null or jsonb_typeof(agreement_domicilium) = 'object'),
  add constraint stand_sales_docusign_envelope_unset
    check (docusign_envelope_id is null),
  add constraint stand_sales_docusign_status_unset
    check (docusign_status is null),
  add constraint stand_sales_docusign_sent_unset
    check (docusign_sent_at is null);

create index if not exists stand_sales_applications_agreement_idx
  on public.stand_sales_applications (tenant_id, stage, agreement_status);

-- Same signature and payment behaviour as 20261125183000. Also sets agreement_status
-- when a payment is applied. Existing paid rows take the column default pending_review.
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
         agreement_status = 'pending_review',
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
