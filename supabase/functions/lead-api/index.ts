// Customer-facing wizard actions. Every call carries { leadId, accessToken } issued at intake.

import { AGREEMENT_TEMPLATE_PATH } from "../_shared/domain/agreement-fields.ts";
import { buildEmailProps } from "../_shared/domain/emails.ts";
import { validateOfferForm } from "../_shared/domain/offer-form.ts";
import { toCustomerLead } from "../_shared/domain/rows.ts";
import type { OfferForm } from "../_shared/domain/types.ts";
import {
  buildAgreementPdf,
  createEnvelope,
  docusignConfig,
  envelopeStatus,
  recipientStatuses,
  recipientViewUrl,
  signersFor,
} from "../_shared/server/docusign.ts";
import { queueEmail } from "../_shared/server/email.ts";
import { HttpError, adminClient, devSimulationsAllowed, env, json, serve } from "../_shared/server/http.ts";
import { loadLead, loadLeadForCustomer, loadStand, updateLead } from "../_shared/server/leads.ts";
import { onPaymentConfirmed } from "../_shared/server/payment.ts";

const now = () => new Date().toISOString();

function sameOrigin(url: string, origin: string) {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
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
      if (lead.idReviewStatus !== "approved") throw new HttpError(409, "Your ID has not been approved yet.");
      if (lead.stage !== "form_filled") throw new HttpError(409, "The offer can no longer be changed.");
      const offer = body.offer as Omit<OfferForm, "submittedAt">;
      const errors = validateOfferForm(offer);
      if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors)[0]!);
      await updateLead(lead.id, { offer: { ...offer, submittedAt: now() }, offer_submitted_at: now(), schedule_accepted_at: null });
      const updated = await loadLead(lead.id);
      await queueEmail("offer_completed", updated, stand);
      await queueEmail("schedule_generated", updated, stand);
      return json({ ok: true });
    }

    case "accept-schedule":
      if (!lead.offer) throw new HttpError(409, "Complete the offer form first.");
      await updateLead(lead.id, { schedule_accepted_at: now() });
      return json({ ok: true });

    case "start-payment": {
      if (lead.idReviewStatus !== "approved" || !lead.scheduleAcceptedAt) throw new HttpError(409, "Previous steps are not complete.");
      const props = buildEmailProps(lead, stand, env("PORTAL_URL"));
      // ZikiMall URL + payload contract TBC: no redirect until it exists. No money moves in this scaffold.
      const base = env("ZIKIMALL_URL");
      return json({
        redirectUrl: base ? `${base}?ref=${encodeURIComponent(lead.id)}` : null,
        simulationAllowed: devSimulationsAllowed(),
        amountCents: props.depositCents / (lead.offer?.depositInstalments ?? 1),
      });
    }

    case "simulate-payment":
      if (!devSimulationsAllowed()) throw new HttpError(403, "Simulations are disabled.");
      await onPaymentConfirmed(lead.id, `ZM-SIM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
      return json({ ok: true });

    case "signing-session": {
      if (lead.stage === "signed") return json({ status: "signed" });
      if (lead.stage !== "paid") throw new HttpError(409, "Payment must be confirmed before signing.");
      const c = docusignConfig();
      if (!c) {
        return json({
          status: "not_configured",
          message: "DocuSign demo keys are not configured on the server yet.",
          simulationAllowed: devSimulationsAllowed(),
        });
      }
      const origin = String(body.origin ?? "");
      const returnUrl = String(body.returnUrl ?? "");
      if (!sameOrigin(returnUrl, origin)) throw new HttpError(400, "Invalid return URL.");

      let envelopeId = lead.envelopeId;
      if (!envelopeId) {
        const templateUrl = env("AGREEMENT_TEMPLATE_URL") || `${origin}${AGREEMENT_TEMPLATE_PATH}`;
        const pdf = await buildAgreementPdf(templateUrl, lead, stand);
        envelopeId = await createEnvelope(c, lead, pdf);
        await updateLead(lead.id, { envelope_id: envelopeId });
      }
      if ((await envelopeStatus(c, envelopeId)) === "completed") return json({ status: "waiting_for_completion" });

      // Co-owners sign sequentially on the same device; hand over to the next unsigned signer.
      const statuses = await recipientStatuses(c, envelopeId);
      const signers = signersFor(lead);
      const nextIdx = signers.findIndex((s) => statuses.find((r) => r.recipientId === s.recipientId)?.status !== "completed");
      if (nextIdx === -1) return json({ status: "waiting_for_completion" });
      const signer = signers[nextIdx];
      const url = await recipientViewUrl(c, envelopeId, signer, returnUrl, origin);
      return json({
        status: "ready",
        url,
        signerName: signer.name,
        signerIndex: nextIdx,
        totalSigners: signers.length,
        integrationKey: c.integrationKey,
      });
    }

    case "simulate-signing": {
      if (!devSimulationsAllowed()) throw new HttpError(403, "Simulations are disabled.");
      const envelopeId = lead.envelopeId ?? `SIMULATED-${lead.id.slice(0, 8)}`;
      await updateLead(lead.id, { envelope_id: envelopeId });
      const { error } = await adminClient().rpc("mark_signed", { p_envelope_id: envelopeId });
      if (error) throw new HttpError(409, error.message);
      const signed = await loadLead(lead.id);
      await queueEmail("agreement_signed", signed, stand);
      await queueEmail("portal_created", signed, stand);
      return json({ ok: true });
    }

    case "activate-portal": {
      if (lead.stage !== "signed") throw new HttpError(409, "Sign the agreement first.");
      if (lead.portalStatus === "activated") return json({ ok: true });
      const db = adminClient();
      const { data: row } = await db.from("leads").select("portal_user_id").eq("id", lead.id).single();
      const portalUserId: string | null = row?.portal_user_id ?? null;
      if (lead.portalStatus !== "created" || !portalUserId) throw new HttpError(409, "Your portal account is not ready yet.");
      const method = body.method ?? {};
      if (method.kind === "password") {
        const pw = String(method.password ?? "");
        if (pw.length < 10) throw new HttpError(400, "Use at least 10 characters.");
        const { error } = await db.auth.admin.updateUserById(portalUserId, { password: pw, email_confirm: true });
        if (error) throw new HttpError(500, "Could not activate your account.");
      } else if (method.kind === "magic_link") {
        // A real magic link would email the customer; that is not allowed yet. Dev simulation only.
        if (!devSimulationsAllowed()) throw new HttpError(403, "Magic-link activation is not available yet. Please set a password.");
        const { error } = await db.auth.admin.updateUserById(portalUserId, { email_confirm: true });
        if (error) throw new HttpError(500, "Could not activate your account.");
      } else {
        throw new HttpError(400, "Choose an activation method.");
      }
      await updateLead(lead.id, { portal_status: "activated", portal_activated_at: now() });
      await queueEmail("celebration", await loadLead(lead.id), stand);
      return json({ ok: true });
    }

    default:
      throw new HttpError(400, "Unknown action.");
  }
});
