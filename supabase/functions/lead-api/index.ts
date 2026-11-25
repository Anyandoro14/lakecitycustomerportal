// Customer-facing wizard actions. Every call carries { leadId, accessToken } issued on the stand page.

import { CAMPAIGN, paymentDueNowCents } from "../_shared/domain/campaign.ts";
import { DuplicateStandRecordError, createMockIntegrations, matchesPortalCredentials, prepopulatePortalRecords } from "../_shared/domain/integrations.ts";
import { mockPaymentConfirmationAdapter } from "../_shared/domain/payment-events.ts";
import { ZIKIMALL, zikimallAccountNumber } from "../_shared/domain/payment-methods.ts";
import { normaliseOffer, validateOfferForm } from "../_shared/domain/offer-form.ts";
import { rowToLead, toCustomerLead } from "../_shared/domain/rows.ts";
import type { OfferSubmission } from "../_shared/domain/types.ts";
import { queueEmail } from "../_shared/server/email.ts";
import { HttpError, adminClient, devSimulationsAllowed, json, serve } from "../_shared/server/http.ts";
import { loadLead, loadLeadForCustomer, loadStand, updateLead } from "../_shared/server/leads.ts";
import { handlePaymentConfirmed } from "../_shared/server/payment.ts";

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
      // Plain link to zikimall.com (new tab). No API: this app never handles the money.
      return json({
        zikimallUrl: ZIKIMALL.url,
        accountNumber: zikimallAccountNumber(lead),
        simulationAllowed: devSimulationsAllowed(),
        amountCents: paymentDueNowCents(),
      });
    }

    case "simulate-payment": {
      // Dev only: the MOCK ZikiMall/CBZ adapter emits a confirmation that goes through the real handler.
      if (!devSimulationsAllowed()) throw new HttpError(403, "Simulations are disabled.");
      const surname = (lead.offer?.buyer.fullName ?? lead.contact.fullName).trim().split(/\s+/).at(-1);
      const event = mockPaymentConfirmationAdapter.simulate({
        standNumber: lead.standNumber,
        payerSurname: surname,
        reference: typeof body.reference === "string" ? body.reference : undefined,
      });
      const outcome = await handlePaymentConfirmed(event);
      if (outcome.status === "rejected" || outcome.status === "unmatched") throw new HttpError(409, outcome.reason);
      return json(outcome);
    }

    case "enrol-portal": {
      if (lead.stage === "form_filled") throw new HttpError(409, "Your payment has not been confirmed yet.");
      if (!matchesPortalCredentials(lead, String(body.standNumber ?? ""), String(body.phone ?? ""))) {
        throw new HttpError(403, "The stand number and phone number don't match this application.");
      }
      if (lead.portalStatus === "prepopulated") return json({ ok: true });
      // MOCK adapters only: nothing is written to the collection schedule, master schedule or Odoo (OI-TBC-15..17).
      // Stand number is the key: seed the adapters with the stand's existing records so a second buyer is rejected.
      const { data: sameStand, error } = await adminClient().from("leads").select("*").eq("stand_number", lead.standNumber).eq("portal_status", "prepopulated");
      if (error) throw new HttpError(500, "Could not check existing records.");
      let records;
      try {
        records = prepopulatePortalRecords({ lead, stand, now: new Date() }, createMockIntegrations((sameStand ?? []).map(rowToLead)));
      } catch (e) {
        if (e instanceof DuplicateStandRecordError) throw new HttpError(409, `Stand ${lead.standNumber} is already set up for another buyer.`);
        throw e;
      }
      await updateLead(lead.id, { portal_status: "prepopulated", portal_records: records, portal_prepopulated_at: now() });
      await queueEmail("portal_ready", await loadLead(lead.id), stand);
      return json({ ok: true });
    }

    default:
      throw new HttpError(400, "Unknown action.");
  }
});
