// Customer-facing wizard actions. Every call carries { leadId, accessToken } issued on the stand page.

import { CAMPAIGN, paymentDueNowCents } from "../_shared/domain/campaign.ts";
import { DuplicateStandRecordError, createMockIntegrations, matchesPortalCredentials, prepopulatePortalRecords } from "../_shared/domain/integrations.ts";
import { buildLiteForm, newMerchantReference, storedResult, type PaymentAttempt } from "../_shared/domain/iveri.ts";
import { normaliseOffer, validateOfferForm } from "../_shared/domain/offer-form.ts";
import { rowToLead, toCustomerLead } from "../_shared/domain/rows.ts";
import type { OfferSubmission } from "../_shared/domain/types.ts";
import { queueEmail } from "../_shared/server/email.ts";
import { HttpError, adminClient, devSimulationsAllowed, env, json, serve } from "../_shared/server/http.ts";
import { loadLead, loadLeadForCustomer, loadStand, updateLead } from "../_shared/server/leads.ts";
import { dbFailure, getAttempt, iveriConfig, iveriDeps, latestAttempt, processIveriReturn } from "../_shared/server/payment.ts";

const now = () => new Date().toISOString();

/** Re-checks AuthoriseInfo while the outcome is open; otherwise returns the stored result. */
async function resultFor(attempt: PaymentAttempt, kind?: string) {
  if (attempt.status === "started" || attempt.status === "pending") {
    return processIveriReturn(iveriDeps(iveriConfig()), { reference: attempt.reference, kind });
  }
  return { ...storedResult(attempt, kind), leadId: attempt.leadId, reference: attempt.reference, applied: null };
}

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
      if (lead.stage !== "form_filled") throw new HttpError(409, "This application has already been paid.");
      if (stand.status !== "available") throw new HttpError(409, "Sorry, this stand is no longer available.");
      const config = iveriConfig();
      const reference = newMerchantReference(lead.standNumber);
      const amountCents = paymentDueNowCents();
      const { error } = await adminClient().from("payment_attempts").insert({ reference, lead_id: lead.id, stand_number: lead.standNumber, amount_cents: amountCents });
      if (error) throw dbFailure("payment_attempts insert", error);
      const returnUrl = env("IVERI_RETURN_URL") || `${env("SUPABASE_URL")}/functions/v1/iveri-return`;
      const form = await buildLiteForm({
        config,
        amountCents,
        email: lead.contact.email,
        reference,
        description: `LakeCity stand ${lead.standNumber}: down payment + legal fee`,
        returnUrl,
      });
      return json({ kind: "iveri", reference, amountCents, action: form.action, fields: form.fields, simulationAllowed: devSimulationsAllowed() });
    }

    case "payment-result":
    case "check-payment": {
      const attempt = body.action === "payment-result" ? await getAttempt(String(body.reference ?? "")) : await latestAttempt(lead.id);
      if (!attempt || attempt.leadId !== lead.id) throw new HttpError(404, "We couldn't find this payment.");
      return json(await resultFor(attempt, typeof body.kind === "string" ? body.kind : undefined));
    }

    case "simulate-payment": {
      // Dev only: stands in for the iVeri hosted page + AuthoriseInfo. The attempt must belong to the caller's
      // own lead, and that lead must hold an open offer.
      if (!devSimulationsAllowed()) throw new HttpError(403, "Simulations are disabled.");
      const attempt = await getAttempt(String(body.reference ?? ""));
      if (!attempt || attempt.leadId !== lead.id) throw new HttpError(404, "We couldn't find this payment.");
      if (!lead.offer || lead.stage !== "form_filled") throw new HttpError(409, "This application is not awaiting payment.");
      const cardStatus = body.cardStatus === null ? null : Number(body.cardStatus);
      if (cardStatus !== null && !Number.isInteger(cardStatus)) throw new HttpError(400, "Invalid card status.");
      const deps = iveriDeps(iveriConfig(), {
        source: "mock-iveri",
        authoriseInfo: () => Promise.resolve({ cardStatus, description: "", trace: attempt.reference, amountCents: attempt.amountCents }),
      });
      return json(await processIveriReturn(deps, { reference: attempt.reference, kind: cardStatus === 0 ? "success" : "fail" }));
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
      if (error) throw dbFailure("leads same stand", error);
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
