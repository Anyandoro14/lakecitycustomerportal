import { queueEmail } from "./email.ts";
import { HttpError, adminClient } from "./http.ts";
import { loadLead, loadStand, updateLead } from "./leads.ts";

/**
 * Payment confirmed (ZikiMall callback or dev simulation):
 *  1. stand leaves inventory (status paid, reserved to the lead) - atomic SQL function
 *  2. collection schedule account created (mock id until the real collections system is integrated, TBC)
 *  3. customer portal account auto-created, pre-linked to that account + stand, using the intake email
 *     (Supabase Auth stands in for the StandLedger portal identity; activation happens in the wizard)
 */
export async function onPaymentConfirmed(leadId: string, reference: string) {
  const db = adminClient();
  const { error } = await db.rpc("confirm_payment", { p_lead_id: leadId, p_reference: reference });
  if (error) throw new HttpError(409, error.message);

  const lead = await loadLead(leadId);
  if (lead.collectionAccountId) return; // idempotent
  const stand = await loadStand(lead.standNumber);
  await queueEmail("payment_received", lead, stand);

  const accountId = `LC-CS-${lead.standNumber}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  // createUser does not send any email.
  const { data: user, error: userErr } = await db.auth.admin.createUser({
    email: lead.buyer.email,
    email_confirm: false,
    user_metadata: { role: "customer", lead_id: lead.id, stand_number: lead.standNumber, collection_account_id: accountId },
  });
  const now = new Date().toISOString();
  await updateLead(leadId, {
    collection_account_id: accountId,
    collection_account_created_at: now,
    portal_status: userErr ? "not_created" : "created",
    portal_user_id: user?.user?.id ?? null,
    portal_created_at: userErr ? null : now,
  });
  if (userErr) console.error(`[portal] account creation failed for lead ${leadId.slice(0, 8)}: ${userErr.message}`);
}
