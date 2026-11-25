// Valerie's sales report (Alex, 2026-11-25, OI-TBC-09 closed). Every lead in the report has exactly
// one of three statuses. A buyer who pays but never signs stays "Signed up and Paid" and is still
// enrolled in the portal and Odoo (enrolment follows confirmed payment, not signing).
// Applications without a submitted offer are not "signed up" yet and are left out (OI-TBC-29).

import { PRICE_VAT_NOTE, standPriceCents } from "./campaign.ts";
import { formatCents } from "./schedule.ts";
import type { Lead, Stand } from "./types.ts";

export type ReportStatus = "signed_up" | "signed_up_paid" | "signed_up_paid_signed";

export const REPORT_STATUSES: { key: ReportStatus; label: string; meaning: string }[] = [
  { key: "signed_up", label: "Signed up", meaning: "Offer form submitted" },
  { key: "signed_up_paid", label: "Signed up and Paid", meaning: "Card payment approved (iVeri AuthoriseInfo status 0)" },
  { key: "signed_up_paid_signed", label: "Signed up, Paid and Signed", meaning: "Agreement of Sale signed" },
];

export const reportStatusLabel = (s: ReportStatus) => REPORT_STATUSES.find((r) => r.key === s)!.label;

/** null = not in the report (offer form not submitted yet). */
export function reportStatus(lead: Pick<Lead, "offer" | "stage">): ReportStatus | null {
  if (!lead.offer) return null;
  if (lead.stage === "signed") return "signed_up_paid_signed";
  if (lead.stage === "paid") return "signed_up_paid";
  return "signed_up";
}

export function reportCounts(leads: Pick<Lead, "offer" | "stage">[]): Record<ReportStatus, number> & { notInReport: number } {
  const c = { signed_up: 0, signed_up_paid: 0, signed_up_paid_signed: 0, notInReport: 0 };
  for (const l of leads) {
    const s = reportStatus(l);
    if (s) c[s]++;
    else c.notInReport++;
  }
  return c;
}

const csvCell = (v: unknown) => {
  const raw = v === null || v === undefined ? "" : String(v);
  // Customer-typed text must not run as a spreadsheet formula.
  const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV export of the report. Contains contact details only (no ID numbers). Generated in the staff browser. */
export function reportCsv(leads: Lead[], stands: Stand[]): string {
  const byNumber = new Map(stands.map((s) => [s.standNumber, s]));
  const header = [
    "Status", "Stand", "Phase", "Size (m2)", `Price USD (${PRICE_VAT_NOTE})`, "Buyer", "Email", "Phone",
    "Offer submitted", "Payment confirmed", "Payment reference", "Portal", "Agreement signed",
  ];
  const rows = leads.flatMap((l) => {
    const status = reportStatus(l);
    if (!status) return [];
    const stand = byNumber.get(l.standNumber);
    return [[
      reportStatusLabel(status),
      l.standNumber,
      stand?.phase ?? "",
      stand?.sizeSqm ?? "",
      stand?.sizeSqm ? formatCents(standPriceCents(stand.sizeSqm)) : "",
      l.offer?.buyer.fullName ?? l.contact.fullName,
      l.contact.email,
      l.contact.phone,
      l.offer?.submittedAt?.slice(0, 10) ?? "",
      l.paidAt?.slice(0, 10) ?? "",
      l.paymentReference ?? "",
      l.portalStatus === "prepopulated" ? "Enrolled (mock records)" : "Not yet",
      l.signedAt?.slice(0, 10) ?? "",
    ]];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
