// Portal account step: pre-populate the customer's records in LakeCity's back-office systems.
// STAND NUMBER is the unique identifier and join key across the Collection Schedule, the Master
// Schedule and Odoo (Alex, 2026-11-25): one record per stand in each system, upserted by stand number;
// a second buyer for the same stand is rejected.
// Only interfaces + MOCK adapters exist. They build the records in memory and write nothing to the real
// sheets or to Odoo until Alex gives the go-ahead (OI-TBC-15/16/17: key decided, live connection pending).

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
  /** Join key: every Odoo ref below is derived from it. */
  standNumber: string;
  partner: { ref: string; name: string; email: string; phone: string };
  /** Customer receivable / analytic account for the stand. Model names TBC with Odoo admin. */
  account: { ref: string; name: string; standNumber: string };
  /** Payment already received at the card payment step. */
  payment: { ref: string; amountCents: number; date: string; memo: string };
}

export interface PortalRecords {
  collectionSchedule: CollectionScheduleRecord;
  masterSchedule: MasterScheduleRow;
  odoo: OdooRecords;
  createdAt: string;
  adapter: "mock";
}

export interface PrepopulateInput {
  lead: Lead;
  stand: Stand;
  now: Date;
}

/** Thrown when a stand already has records that belong to a different lead. */
export class DuplicateStandRecordError extends Error {
  constructor(public system: string, public standNumber: string) {
    super(`Stand ${standNumber} already has a ${system} record for another buyer.`);
  }
}

/** One row per stand number. Upsert by stand: same lead updates, another lead is rejected. */
export class StandKeyedStore<T> {
  private rows = new Map<string, { leadId: string; record: T }>();
  constructor(private system: string) {}

  upsert(standNumber: string, leadId: string, record: T): T {
    const key = standNumber.trim();
    const existing = this.rows.get(key);
    if (existing && existing.leadId !== leadId) throw new DuplicateStandRecordError(this.system, key);
    this.rows.set(key, { leadId, record });
    return record;
  }

  get(standNumber: string): T | null {
    return this.rows.get(standNumber.trim())?.record ?? null;
  }

  get size(): number {
    return this.rows.size;
  }
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

export interface Integrations {
  collectionSchedule: CollectionScheduleAdapter;
  masterSchedule: MasterScheduleAdapter;
  odoo: OdooAdapter;
}

function buildCollectionRecord({ lead, stand, now }: PrepopulateInput): CollectionScheduleRecord {
  if (!stand.sizeSqm) throw new Error("Stand size is unknown.");
  if (stand.standNumber !== lead.standNumber) throw new Error("Stand number does not match the application.");
  const startDate = (lead.paidAt ?? now.toISOString()).slice(0, 10);
  const schedule = computeSchedule({ sizeSqm: stand.sizeSqm, startDate });
  const q = schedule.quote;
  const paid = lead.paymentAmountCents ?? 0;
  const legalFeePaid = Math.min(paid, q.legalFeeCents);
  const paidTowardPrice = paid - legalFeePaid;
  return {
    accountId: `MOCK-CS-${stand.standNumber}`,
    standNumber: stand.standNumber,
    sizeSqm: stand.sizeSqm,
    customerName: lead.offer?.buyer.fullName ?? lead.contact.fullName,
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
}

export interface MockIntegrations extends Integrations {
  stores: {
    collectionSchedule: StandKeyedStore<CollectionScheduleRecord>;
    masterSchedule: StandKeyedStore<MasterScheduleRow>;
    odoo: StandKeyedStore<OdooRecords>;
  };
}

/**
 * In-memory MOCK adapters (read-only towards real systems). Seed them with the leads that already hold
 * records so the one-record-per-stand rule holds across calls.
 */
export function createMockIntegrations(existing: Pick<Lead, "id" | "portalRecords">[] = []): MockIntegrations {
  const stores = {
    collectionSchedule: new StandKeyedStore<CollectionScheduleRecord>("Collection Schedule"),
    masterSchedule: new StandKeyedStore<MasterScheduleRow>("Master Schedule"),
    odoo: new StandKeyedStore<OdooRecords>("Odoo"),
  };
  for (const l of existing) {
    const r = l.portalRecords;
    if (!r) continue;
    stores.collectionSchedule.upsert(r.collectionSchedule.standNumber, l.id, r.collectionSchedule);
    stores.masterSchedule.upsert(r.masterSchedule.standNumber, l.id, r.masterSchedule);
    stores.odoo.upsert(r.odoo.standNumber ?? r.collectionSchedule.standNumber, l.id, r.odoo);
  }
  return {
    stores,
    collectionSchedule: {
      upsertAccount: (input) => stores.collectionSchedule.upsert(input.stand.standNumber, input.lead.id, buildCollectionRecord(input)),
    },
    masterSchedule: {
      upsertRow: ({ lead }, c) =>
        stores.masterSchedule.upsert(c.standNumber, lead.id, {
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
        }),
    },
    odoo: {
      upsertCustomer: ({ lead, now }, c) =>
        stores.odoo.upsert(c.standNumber, lead.id, {
          standNumber: c.standNumber,
          partner: { ref: `MOCK-ODOO-PARTNER-${c.standNumber}`, name: c.customerName, email: c.email, phone: c.phone },
          account: { ref: `MOCK-ODOO-ACC-${c.standNumber}`, name: `Stand ${c.standNumber} - ${c.customerName}`, standNumber: c.standNumber },
          payment: {
            ref: `MOCK-ODOO-PAY-${c.standNumber}`,
            amountCents: c.paidToDateCents,
            date: (lead.paidAt ?? now.toISOString()).slice(0, 10),
            memo: `Down payment + legal fee, ${lead.paymentReference ?? ""}`.trim(),
          },
        }),
    },
  };
}

/** Runs the three adapters in order. All three records carry the same stand number. */
export function prepopulatePortalRecords(input: PrepopulateInput, adapters: Integrations = createMockIntegrations()): PortalRecords {
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
