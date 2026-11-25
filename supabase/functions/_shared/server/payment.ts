import { paymentDueNowCents } from "../domain/campaign.ts";
import { queueEmail } from "./email.ts";
import { HttpError, adminClient } from "./http.ts";
import { loadLead, loadStand } from "./leads.ts";

/**
 * Payment confirmed (ZikiMall callback, or the dev simulation). The amount is the fixed USD 2,250
 * (down payment + legal fee). The stand leaves inventory atomically in SQL (confirm_payment), then
 * the thank-you email is queued to the preview outbox (never sent).
 */
export async function onPaymentConfirmed(leadId: string, reference: string) {
  const before = await loadLead(leadId);
  if (before.stage !== "form_filled") return; // idempotent
  const { error } = await adminClient().rpc("confirm_payment", {
    p_lead_id: leadId,
    p_reference: reference,
    p_amount_cents: paymentDueNowCents(),
  });
  if (error) throw new HttpError(409, error.message);
  const lead = await loadLead(leadId);
  await queueEmail("payment_thank_you", lead, await loadStand(lead.standNumber));
}
