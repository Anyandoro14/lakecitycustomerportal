// Customer-facing wizard actions. Every call carries { leadId, accessToken } issued on the stand page.

import { CAMPAIGN, paymentDueNowCents } from "../_shared/domain/campaign.ts";
import { matchesPortalCredentials, prepopulatePortalRecords } from "../_shared/domain/integrations.ts";
import { normaliseOffer, validateOfferForm } from "../_shared/domain/offer-form.ts";
import { toCustomerLead } from "../_shared/domain/rows.ts";
import type { OfferSubmission } from "../_shared/domain/types.ts";
import { queueEmail } from "../_shared/server/email.ts";
import { HttpError, devSimulationsAllowed, env, json, serve } from "../_shared/server/http.ts";
import { loadLead, loadLeadForCustomer, loadStand, updateLead } from "../_shared/server/leads.ts";
import { onPaymentConfirmed } from "../_shared/server/payment.ts";

const now = () => new Date().toISOString();

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const body = await req.json().catch(() => ({}));
  const lead = await loadLeadForCustomer(body.leadId, body.accessToken);
  const stand = await loadStand(lead.standNumber);

  switch (body.action) {
    case "get":
      return json({ lead: toCustomerLead(lead), stand });

    case "submit-offer": {
      if (lead.stage !== "form_filled") throw new HttpError(409, "The offer can no longer be changed.");
      const offer = body.offer as OfferSubmission;
      const errors = validateOfferForm(offer);
      if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors)[0]!);
      const clean = { ...normaliseOffer(offer), termMonths: CAMPAIGN.termMonths, submittedAt: now() };
      await updateLead(lead.id, { offer: clean, offer_submitted_at: clean.submittedAt });
      await queueEmail("offer_completed", await loadLead(lead.id), stand);
      return json({ ok: true });
    }

    case "start-payment": {
      if (!lead.offer) throw new HttpError(409, "Complete the offer form first.");
      // ZikiMall URL + payload contract TBC (OI-TBC-07): no redirect until it exists. No money moves here.
      const base = env("ZIKIMALL_URL");
      return json({
        redirectUrl: base ? `${base}?ref=${encodeURIComponent(lead.id)}` : null,
        simulationAllowed: devSimulationsAllowed(),
        amountCents: paymentDueNowCents(),
      });
    }

    case "simulate-payment":
      if (!devSimulationsAllowed()) throw new HttpError(403, "Simulations are disabled.");
      await onPaymentConfirmed(lead.id, `ZM-SIM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
      return json({ ok: true });

    case "enrol-portal": {
      if (lead.stage === "form_filled") throw new HttpError(409, "Your payment has not been confirmed yet.");
      if (!matchesPortalCredentials(lead, String(body.standNumber ?? ""), String(body.phone ?? ""))) {
        throw new HttpError(403, "The stand number and phone number don't match this application.");
      }
      if (lead.portalStatus === "prepopulated") return json({ ok: true });
      // MOCK adapters only: nothing is written to the collection schedule, master schedule or Odoo (OI-TBC-15..17).
      const records = prepopulatePortalRecords({ lead, stand, now: new Date() });
      await updateLead(lead.id, { portal_status: "prepopulated", portal_records: records, portal_prepopulated_at: now() });
      await queueEmail("portal_ready", await loadLead(lead.id), stand);
      return json({ ok: true });
    }

    default:
      throw new HttpError(400, "Unknown action.");
  }
});
