import type { Lead, Stand } from "@/lib/backend";
import { CAMPAIGN, resolvePricing } from "@shared/domain/campaign.ts";
import { countryName } from "@shared/domain/countries.ts";
import { ID_TYPE_LABELS } from "@shared/domain/id-validation.ts";
import { offerAcknowledgements } from "@shared/domain/offer-form.ts";
import { computeSchedule, formatCents } from "@shared/domain/schedule.ts";
import { PdfBuilder } from "./builder";

export function scheduleFor(lead: Lead, stand: Stand) {
  const pricing = resolvePricing(stand);
  return {
    pricing,
    schedule: computeSchedule({
      priceUsd: pricing.priceUsd,
      depositUsd: pricing.depositUsd,
      termMonths: lead.offer?.termMonths ?? CAMPAIGN.termMonths,
      depositInstalments: lead.offer?.depositInstalments ?? 1,
      dueDay: CAMPAIGN.dueDay,
      startDate: (lead.offer?.submittedAt ?? new Date().toISOString()).slice(0, 10),
    }),
  };
}

const money = (c: number) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Layout mirrors a clean collection schedule; align to the official Drive template (open item TBC). */
export async function paymentSchedulePdf(lead: Lead, stand: Stand) {
  const { pricing, schedule } = scheduleFor(lead, stand);
  const b = await PdfBuilder.create(
    `Payment Schedule - Stand ${stand.standNumber} (${schedule.termMonths} months, VAT incl.)`,
    `Generated ${new Date().toISOString().slice(0, 10)}${pricing.isPlaceholder ? " · DEMO FIGURES - stand price TBC" : ""}`,
  );
  b.keyValues([
    ["Purchaser", [lead.buyer.fullName, ...lead.coOwners.map((c) => c.fullName)].join(", ")],
    ["Stand", stand.standNumber],
    ["Collection account", lead.collectionAccountId ?? "Created after deposit payment"],
    ["Total price (VAT incl.)", formatCents(schedule.totalCents)],
    [`  of which VAT (${CAMPAIGN.vatRatePercent}%)`, formatCents(schedule.vatCents)],
    ["Deposit", `${formatCents(schedule.depositCents)}${schedule.depositInstalments === 3 ? " (3 monthly payments)" : ""}`],
    ["Balance financed", formatCents(schedule.financedCents)],
    ["Monthly instalment", `${formatCents(schedule.monthlyInstalmentCents)} x ${schedule.termMonths} (final ${formatCents(schedule.finalInstalmentCents)})`],
    ["Due day", `${schedule.dueDay === 1 ? "1st" : "5th"} of each month (standard due day TBC)`],
  ]);
  b.gap(10);
  b.table(
    ["No.", "Payment", "Due date", "Amount (USD)", "Balance (USD)"],
    [40, 170, 90, 100, 100],
    schedule.rows.map((r) => [String(r.no), r.label, r.dueDate, money(r.amountCents), money(r.balanceCents)]),
    [false, false, false, true, true],
  );
  b.gap(10);
  b.text("PLACEHOLDER: amounts are VAT inclusive. The final instalment absorbs rounding differences. Not a tax invoice.", { size: 8 });
  return b.bytes();
}

export async function offerPdf(lead: Lead, stand: Stand) {
  const { pricing, schedule } = scheduleFor(lead, stand);
  const o = lead.offer;
  const b = await PdfBuilder.create(
    "Offer to Purchase - PLACEHOLDER copy of General Offer Form",
    `Stand ${stand.standNumber} · Submitted ${o?.submittedAt.slice(0, 10) ?? "-"}${pricing.isPlaceholder ? " · DEMO FIGURES - price TBC" : ""}`,
  );
  [lead.buyer, ...lead.coOwners].forEach((p, i) => {
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
    ["Residential address", lead.buyer.physicalAddress],
    ["Business phone", o?.businessPhone ?? ""],
    ["Alternative / postal address", o?.alternativeAddress ?? lead.buyer.postalAddress],
  ]);
  if (o) {
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
    ["Price (USD, VAT incl.)", formatCents(schedule.totalCents)],
    ["Initial deposit (USD)", formatCents(schedule.depositCents)],
    ["Term in months", String(schedule.termMonths)],
    ["Monthly payment (USD)", formatCents(schedule.monthlyInstalmentCents)],
  ]);
  b.gap(6);
  b.text("Conditions acknowledged", { font: b.bold, size: 11 });
  for (const a of offerAcknowledgements(schedule.termMonths)) {
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
