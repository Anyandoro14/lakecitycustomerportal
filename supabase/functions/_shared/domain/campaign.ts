// Campaign settings and pricing rules (Alex, 2026-11-25):
//   price = USD 45 x sqm; fixed down payment USD 1,750; legal fee USD 500;
//   due at start = down payment + legal fee = USD 2,250.
// Open items are tagged OI-TBC-nn (see README "Open items").

export const PRICING = {
  pricePerSqmUsd: 45,
  downPaymentUsd: 1750,
  /** Agreement of Sale preparation (legal) fee, non-refundable. */
  legalFeeUsd: 500,
} as const;

export const DUE_AT_START_USD = PRICING.downPaymentUsd + PRICING.legalFeeUsd;

export const CAMPAIGN = {
  /** Instalment term for the balance (price - down payment). */
  termMonths: 48,
  /** Instalment due day of month. Standard due day TBC (OI-TBC-11). */
  dueDay: 5 as 1 | 5,
  legalFeePayee: "Chigwanda Legal Practitioners",
  consecutiveMissedPaymentsBeforeReallocation: 3,
};

const cents = (usd: number) => Math.round(usd * 100);

export interface StandQuote {
  sizeSqm: number;
  priceCents: number;
  downPaymentCents: number;
  legalFeeCents: number;
  /** Down payment + legal fee: the only amount taken at the ZikiMall step. */
  dueNowCents: number;
  /** Price - down payment, paid over CAMPAIGN.termMonths. The legal fee is not part of the price. */
  balanceCents: number;
  termMonths: number;
  monthlyCents: number;
  finalMonthlyCents: number;
}

export function standPriceCents(sizeSqm: number): number {
  return cents(sizeSqm * PRICING.pricePerSqmUsd);
}

export function quoteForSize(sizeSqm: number, termMonths: number = CAMPAIGN.termMonths): StandQuote {
  if (!(sizeSqm > 0)) throw new Error("Stand size must be a positive number of sqm");
  const priceCents = standPriceCents(sizeSqm);
  const downPaymentCents = cents(PRICING.downPaymentUsd);
  const legalFeeCents = cents(PRICING.legalFeeUsd);
  const balanceCents = Math.max(0, priceCents - downPaymentCents);
  const monthlyCents = Math.round(balanceCents / termMonths);
  return {
    sizeSqm,
    priceCents,
    downPaymentCents,
    legalFeeCents,
    dueNowCents: downPaymentCents + legalFeeCents,
    balanceCents,
    termMonths,
    monthlyCents,
    finalMonthlyCents: balanceCents - monthlyCents * (termMonths - 1),
  };
}

/** The amount the ZikiMall step charges. Always computed server-side; never taken from the client. */
export function paymentDueNowCents(): number {
  return cents(DUE_AT_START_USD);
}

// --- Price ranges A / B / C -------------------------------------------------------------------
// The span between the cheapest and dearest stand price is split into three equal bands.
// A = [min, min + w), B = [min + w, min + 2w), C = [min + 2w, max], with w = (max - min) / 3.

export type PriceBandKey = "A" | "B" | "C";

export interface PriceBand {
  key: PriceBandKey;
  fromCents: number;
  toCents: number;
}

export interface PriceBands {
  minCents: number;
  maxCents: number;
  bands: PriceBand[];
}

export function priceBands(pricesCents: number[]): PriceBands | null {
  if (pricesCents.length === 0) return null;
  const minCents = Math.min(...pricesCents);
  const maxCents = Math.max(...pricesCents);
  const span = maxCents - minCents;
  const edge = (k: number) => minCents + Math.round((span * k) / 3);
  return {
    minCents,
    maxCents,
    bands: [
      { key: "A", fromCents: minCents, toCents: edge(1) },
      { key: "B", fromCents: edge(1), toCents: edge(2) },
      { key: "C", fromCents: edge(2), toCents: maxCents },
    ],
  };
}

/** Integer-only comparison so band edges never depend on floating-point rounding. */
export function bandOf(priceCents: number, bands: PriceBands): PriceBandKey {
  const span = bands.maxCents - bands.minCents;
  const offset3 = (priceCents - bands.minCents) * 3;
  if (span === 0 || offset3 < span) return "A";
  if (offset3 < span * 2) return "B";
  return "C";
}

export function filterByBand<T extends { sizeSqm: number | null }>(
  stands: T[],
  band: PriceBandKey | "all",
): T[] {
  if (band === "all") return stands;
  const bands = priceBands(stands.filter((s) => s.sizeSqm).map((s) => standPriceCents(s.sizeSqm!)));
  if (!bands) return [];
  return stands.filter((s) => s.sizeSqm && bandOf(standPriceCents(s.sizeSqm), bands) === band);
}
