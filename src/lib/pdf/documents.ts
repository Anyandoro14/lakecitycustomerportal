import type { Lead, Stand } from "@/lib/backend";
import { countryName } from "@shared/domain/countries.ts";
import { ID_TYPE_LABELS } from "@shared/domain/id-validation.ts";
import { offerAcknowledgements } from "@shared/domain/offer-form.ts";
import { computeSchedule, formatCents } from "@shared/domain/schedule.ts";
import { PdfBuilder } from "./builder";

export function scheduleFor(lead: Lead, stand: Stand) {
  if (!stand.sizeSqm) throw new Error("Stand size is unknown.");
  return computeSchedule({ sizeSqm: stand.sizeSqm, startDate: (lead.paidAt ?? lead.offer?.submittedAt ?? new Date().toISOString()).slice(0, 10) });
}

const money = (c: number) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MOCK = " · MOCK stand size (OI-TBC-04)";

/** Layout is a clean collection schedule; align to the official Drive template (OI-TBC-10). */
export async function paymentSchedulePdf(lead: Lead, stand: Stand) {
  const schedule = scheduleFor(lead, stand);
  const q = schedule.quote;
  const b = await PdfBuilder.create(
    `Payment Schedule - Stand ${stand.standNumber} (${q.termMonths} months)`,
    `Generated ${new Date().toISOString().slice(0, 10)}${MOCK}`,
  );
  b.keyValues([
    ["Purchaser", [lead.offer?.buyer.fullName ?? lead.contact.fullName, ...(lead.offer?.coOwners ?? []).map((c) => c.fullName)].join(", ")],
    ["Stand", `${stand.standNumber} (${q.sizeSqm} m²)`],
    ["Collection account", lead.portalRecords?.collectionSchedule.accountId ?? "Created at the portal account step"],
    ["Price (USD 45 x m²)", formatCents(q.priceCents)],
    ["Down payment", formatCents(q.downPaymentCents)],
    ["Legal fee (Agreement of Sale)", formatCents(q.legalFeeCents)],
    ["Due at start", formatCents(q.dueNowCents)],
    ["Balance over the term", formatCents(q.balanceCents)],
    ["Monthly instalment", `${formatCents(q.monthlyCents)} x ${q.termMonths} (final ${formatCents(q.finalMonthlyCents)})`],
    ["Due day", `${schedule.dueDay === 1 ? "1st" : "5th"} of each month (TBC, OI-TBC-11)`],
  ]);
  b.gap(10);
  b.table(
    ["No.", "Payment", "Due date", "Amount (USD)", "Balance (USD)"],
    [40, 170, 90, 100, 100],
    schedule.rows.map((r) => [String(r.no), r.label, r.dueDate, money(r.amountCents), money(r.balanceCents)]),
    [false, false, false, true, true],
  );
  b.gap(10);
  b.text("PLACEHOLDER: the final instalment absorbs rounding differences. VAT treatment TBC (OI-TBC-06). Not a tax invoice.", { size: 8 });
  return b.bytes();
}

export async function offerPdf(lead: Lead, stand: Stand) {
  const q = scheduleFor(lead, stand).quote;
  const o = lead.offer;
  const b = await PdfBuilder.create(
    "Offer to Purchase - PLACEHOLDER copy of General Offer Form",
    `Stand ${stand.standNumber} · Submitted ${o?.submittedAt.slice(0, 10) ?? "-"}${MOCK}`,
  );
  if (o) {
    [o.buyer, ...o.coOwners].forEach((p, i) => {
      b.text(i === 0 ? "Purchaser" : `Co-purchaser ${i}`, { font: b.bold, size: 11 });
      b.keyValues([
        ["Full name", p.fullName],
        ["D.O.B.", p.dateOfBirth],
        ["ID", `${p.idNumber} (${ID_TYPE_LABELS[p.idType]}, ${countryName(p.idIssuingCountry)})`],
        ["Cell", p.phone],
        ["Email", p.email],
      ]);
      b.gap(6);
    });
    b.keyValues([
      ["Residential address", o.buyer.physicalAddress],
      ["Postal address", o.buyer.postalAddress],
      ["Business phone", o.businessPhone],
      ["Alternative address", o.alternativeAddress],
    ]);
    b.gap(6);
    b.text("Next of kin", { font: b.bold, size: 11 });
    const n = o.nextOfKin;
    b.keyValues([
      ["Full name", n.fullName],
      ["D.O.B.", n.dateOfBirth],
      ["ID number", n.idNumber],
      ["Residential address", n.residentialAddress],
      ["Cell", n.cellPhone],
      ["Business phone", n.businessPhone],
      ["Email", n.email],
      ["Alternative / postal address", n.alternativeAddress],
    ]);
  }
  b.gap(6);
  b.text("Offer", { font: b.bold, size: 11 });
  b.keyValues([
    ["Stand number", stand.standNumber],
    ["Size", `${q.sizeSqm} m²`],
    ["Price (USD)", formatCents(q.priceCents)],
    ["Down payment (USD)", formatCents(q.downPaymentCents)],
    ["Legal fee (USD)", formatCents(q.legalFeeCents)],
    ["Due at start (USD)", formatCents(q.dueNowCents)],
    ["Term in months", String(q.termMonths)],
    ["Monthly payment (USD)", formatCents(q.monthlyCents)],
  ]);
  b.gap(6);
  b.text("Conditions acknowledged", { font: b.bold, size: 11 });
  for (const a of offerAcknowledgements(q.termMonths)) {
    b.text(`[${o?.acknowledgements[a.key] ? "x" : " "}] ${a.text}`, { size: 9 });
  }
  if (o) {
    b.gap(6);
    b.keyValues([
      ["Signed at", o.signedAtPlace],
      ["Date", o.signedDate],
      ["Purchaser name", o.purchaserName],
      ["Signature", o.signatureType === "typed" ? o.signatureValue : "(drawn signature below)"],
    ]);
    if (o.signatureType === "drawn" && o.signatureValue.startsWith("data:image/png")) {
      const png = await b.doc.embedPng(o.signatureValue);
      const w = 180;
      const h = (png.height / png.width) * w;
      b.ensure(h + 10);
      b.page.drawImage(png, { x: b.margin + 170, y: b.y - h, width: w, height: h });
      b.gap(h + 10);
    }
  }
  return b.bytes();
}
