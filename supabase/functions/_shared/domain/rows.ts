// Maps Postgres rows (snake_case) to domain objects. Shared by the browser (staff reads) and edge functions.

import type { CoOwner, Lead, Stand } from "./types.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function rowToStand(r: Row): Stand {
  return {
    standNumber: r.stand_number,
    sizeSqm: num(r.size_sqm),
    priceUsd: num(r.price_usd),
    depositUsd: num(r.deposit_usd),
    status: r.status,
    reservedLeadId: r.reserved_lead_id ?? null,
  };
}

export function rowToCoOwner(r: Row): CoOwner {
  return {
    id: r.id,
    position: r.position,
    fullName: r.full_name,
    dateOfBirth: r.date_of_birth,
    email: r.email,
    phone: r.phone,
    idType: r.id_type,
    idIssuingCountry: r.id_issuing_country,
    idNumber: r.id_number,
    idExpiry: r.id_expiry ?? null,
    idFrontPath: r.id_front_path ?? null,
    idBackPath: r.id_back_path ?? null,
  };
}

export function rowToLead(r: Row): Lead {
  const coOwners: Row[] = r.co_owners ?? [];
  return {
    id: r.id,
    createdAt: r.created_at,
    stage: r.stage,
    idReviewStatus: r.id_review_status,
    idReviewReason: r.id_review_reason ?? null,
    idReviewedBy: r.id_reviewed_by ?? null,
    idReviewedAt: r.id_reviewed_at ?? null,
    buyer: {
      fullName: r.full_name,
      dateOfBirth: r.date_of_birth,
      email: r.email,
      phone: r.phone,
      physicalAddress: r.physical_address,
      postalAddress: r.postal_address,
      country: r.country,
      idType: r.id_type,
      idIssuingCountry: r.id_issuing_country,
      idNumber: r.id_number,
      idExpiry: r.id_expiry ?? null,
      idFrontPath: r.id_front_path ?? null,
      idBackPath: r.id_back_path ?? null,
    },
    coOwners: coOwners.map(rowToCoOwner).sort((a, b) => a.position - b.position),
    standNumber: r.stand_number,
    offer: r.offer ?? null,
    officialUse: r.official_use ?? null,
    scheduleEmailedAt: r.offer_submitted_at ?? null,
    scheduleAcceptedAt: r.schedule_accepted_at ?? null,
    paidAt: r.paid_at ?? null,
    paymentReference: r.payment_reference ?? null,
    collectionAccountId: r.collection_account_id ?? null,
    collectionAccountCreatedAt: r.collection_account_created_at ?? null,
    portalStatus: r.portal_status,
    portalCreatedAt: r.portal_created_at ?? null,
    portalActivatedAt: r.portal_activated_at ?? null,
    envelopeId: r.envelope_id ?? null,
    signedAt: r.signed_at ?? null,
  };
}

/** Customer-facing copy of a lead: strips staff-only fields and storage paths. */
export function toCustomerLead(lead: Lead): Lead {
  const strip = <T extends { idFrontPath: string | null; idBackPath: string | null }>(p: T): T => ({
    ...p,
    idFrontPath: p.idFrontPath ? "stored" : null,
    idBackPath: p.idBackPath ? "stored" : null,
  });
  return {
    ...lead,
    buyer: strip(lead.buyer),
    coOwners: lead.coOwners.map(strip),
    officialUse: null,
    idReviewedBy: null,
  };
}
