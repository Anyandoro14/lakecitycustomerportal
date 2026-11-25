// Portal account step: pre-populate the customer's records in LakeCity's back-office systems.
// Only interfaces + MOCK adapters exist. They build the records in memory and write nothing to
// the real Collection Schedule / Master Schedule sheets or to Odoo (OI-TBC-15, OI-TBC-16, OI-TBC-17).

import { computeSchedule, type ScheduleRow } from "./schedule.ts";
import type { Lead, Stand } from "./types.ts";

export interface CollectionScheduleRecord {
  accountId: string;
  standNumber: string;
  sizeSqm: number;
  customerName: string;
  phone: string;
  email: string;
  priceCents: number;
  downPaymentCents: number;
  legalFeeCents: number;
  /** Everything received so far, including the legal fee. */
  paidToDateCents: number;
  /** The part of paidToDateCents that counts toward the stand price (excludes the legal fee). */
  paidTowardPriceCents: number;
  legalFeePaidCents: number;
  /** priceCents - paidTowardPriceCents. */
  balanceCents: number;
  monthlyCents: number;
  termMonths: number;
  rows: ScheduleRow[];
}

export interface MasterScheduleRow {
  rowId: string;
  standNumber: string;
  sizeSqm: number;
  customerName: string;
  phone: string;
  email: string;
  priceCents: number;
  paidToDateCents: number;
  paidTowardPriceCents: number;
  legalFeePaidCents: number;
  balanceCents: number;
  status: string;
  paymentReference: string;
  collectionAccountId: string;
}

export interface OdooRecords {
  partner: { ref: string; name: string; email: string; phone: string };
  /** Customer receivable / analytic account for the stand. Model names TBC with Odoo admin. */
  account: { ref: string; name: string; standNumber: string };
  /** Payment already received at the ZikiMall step. */
  payment: { ref: string; amountCents: number; date: string; memo: string };
}

export interface PortalRecords {
  collectionSchedule: CollectionScheduleRecord;
  masterSchedule: MasterScheduleRow;
  odoo: OdooRecords;
  createdAt: string;
  adapter: "mock";
}

export interface CollectionScheduleAdapter {
  upsertAccount(input: PrepopulateInput): CollectionScheduleRecord;
}
export interface MasterScheduleAdapter {
  upsertRow(input: PrepopulateInput, collection: CollectionScheduleRecord): MasterScheduleRow;
}
export interface OdooAdapter {
  upsertCustomer(input: PrepopulateInput, collection: CollectionScheduleRecord): OdooRecords;
}

export interface PrepopulateInput {
  lead: Lead;
  stand: Stand;
  now: Date;
}

const suffix = (leadId: string) => leadId.replace(/-/g, "").slice(0, 6).toUpperCase();

export const mockCollectionScheduleAdapter: CollectionScheduleAdapter = {
  upsertAccount({ lead, stand, now }) {
    if (!stand.sizeSqm) throw new Error("Stand size is unknown.");
    const startDate = (lead.paidAt ?? now.toISOString()).slice(0, 10);
    const schedule = computeSchedule({ sizeSqm: stand.sizeSqm, startDate });
    const q = schedule.quote;
    const paid = lead.paymentAmountCents ?? 0;
    const legalFeePaid = Math.min(paid, q.legalFeeCents);
    const paidTowardPrice = paid - legalFeePaid;
    const name = lead.offer?.buyer.fullName ?? lead.contact.fullName;
    return {
      accountId: `MOCK-CS-${stand.standNumber}-${suffix(lead.id)}`,
      standNumber: stand.standNumber,
      sizeSqm: stand.sizeSqm,
      customerName: name,
      phone: lead.contact.phone,
      email: lead.contact.email,
      priceCents: q.priceCents,
      downPaymentCents: q.downPaymentCents,
      legalFeeCents: q.legalFeeCents,
      paidToDateCents: paid,
      paidTowardPriceCents: paidTowardPrice,
      legalFeePaidCents: legalFeePaid,
      balanceCents: q.priceCents - paidTowardPrice,
      monthlyCents: q.monthlyCents,
      termMonths: q.termMonths,
      rows: schedule.rows,
    };
  },
};

export const mockMasterScheduleAdapter: MasterScheduleAdapter = {
  upsertRow({ lead }, c) {
    return {
      rowId: `MOCK-MS-${c.standNumber}`,
      standNumber: c.standNumber,
      sizeSqm: c.sizeSqm,
      customerName: c.customerName,
      phone: c.phone,
      email: c.email,
      priceCents: c.priceCents,
      paidToDateCents: c.paidToDateCents,
      paidTowardPriceCents: c.paidTowardPriceCents,
      legalFeePaidCents: c.legalFeePaidCents,
      balanceCents: c.balanceCents,
      status: "Down payment + legal fee received",
      paymentReference: lead.paymentReference ?? "",
      collectionAccountId: c.accountId,
    };
  },
};

export const mockOdooAdapter: OdooAdapter = {
  upsertCustomer({ lead, now }, c) {
    const s = suffix(lead.id);
    return {
      partner: { ref: `MOCK-ODOO-PARTNER-${s}`, name: c.customerName, email: c.email, phone: c.phone },
      account: { ref: `MOCK-ODOO-ACC-${c.standNumber}-${s}`, name: `Stand ${c.standNumber} - ${c.customerName}`, standNumber: c.standNumber },
      payment: {
        ref: `MOCK-ODOO-PAY-${s}`,
        amountCents: c.paidToDateCents,
        date: (lead.paidAt ?? now.toISOString()).slice(0, 10),
        memo: `Down payment + legal fee, ${lead.paymentReference ?? ""}`.trim(),
      },
    };
  },
};

export interface Integrations {
  collectionSchedule: CollectionScheduleAdapter;
  masterSchedule: MasterScheduleAdapter;
  odoo: OdooAdapter;
}

export const MOCK_INTEGRATIONS: Integrations = {
  collectionSchedule: mockCollectionScheduleAdapter,
  masterSchedule: mockMasterScheduleAdapter,
  odoo: mockOdooAdapter,
};

export function prepopulatePortalRecords(input: PrepopulateInput, adapters: Integrations = MOCK_INTEGRATIONS): PortalRecords {
  const collectionSchedule = adapters.collectionSchedule.upsertAccount(input);
  return {
    collectionSchedule,
    masterSchedule: adapters.masterSchedule.upsertRow(input, collectionSchedule),
    odoo: adapters.odoo.upsertCustomer(input, collectionSchedule),
    createdAt: input.now.toISOString(),
    adapter: "mock",
  };
}

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * Portal step identity check: stand number + phone must match the application.
 * Phones match on their last 9 digits so "+263 77 123 4567" and "0771234567" are equal.
 */
export function matchesPortalCredentials(lead: Lead, standNumber: string, phone: string): boolean {
  const a = digits(phone);
  const b = digits(lead.contact.phone);
  if (a.length < 7 || b.length < 7) return false;
  return standNumber.trim() === lead.standNumber && a.slice(-9) === b.slice(-9);
}
