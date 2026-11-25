// Maps Postgres rows (snake_case) to domain objects. Shared by the browser (staff reads) and edge functions.

import type { Lead, Stand } from "./types.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function rowToStand(r: Row): Stand {
  return {
    standNumber: r.stand_number,
    sizeSqm: num(r.size_sqm),
    status: r.status,
    reservedLeadId: r.reserved_lead_id ?? null,
  };
}

export function rowToLead(r: Row): Lead {
  return {
    id: r.id,
    createdAt: r.created_at,
    stage: r.stage,
    contact: { fullName: r.full_name, email: r.email, phone: r.phone },
    standNumber: r.stand_number,
    offer: r.offer ?? null,
    officialUse: r.official_use ?? null,
    paidAt: r.paid_at ?? null,
    paymentReference: r.payment_reference ?? null,
    paymentAmountCents: num(r.payment_amount_cents),
    portalStatus: r.portal_status,
    portalRecords: r.portal_records ?? null,
    envelopeId: r.envelope_id ?? null,
    signedAt: r.signed_at ?? null,
  };
}

/** Customer-facing copy of a lead: strips staff-only fields. */
export function toCustomerLead(lead: Lead): Lead {
  return { ...lead, officialUse: null };
}
