// LakeCity stand campaign pricing. Price = USD 45 x m², including 15.5% VAT.
// The card step always charges USD 2,250 (1,750 down payment + 500 legal fee) = 225000 cents.

export const PRICING = {
  pricePerSqmUsd: 45,
  downPaymentUsd: 1750,
  legalFeeUsd: 500,
} as const;

export const VAT_NOTE = "incl. 15.5% VAT";
export const DUE_AT_START_USD = PRICING.downPaymentUsd + PRICING.legalFeeUsd;
export const DUE_NOW_CENTS = DUE_AT_START_USD * 100;
export const TERM_MONTHS = 48;

export function standPriceCents(sizeSqm: number): number {
  return Math.round(sizeSqm * PRICING.pricePerSqmUsd * 100);
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export type PriceBandKey = "A" | "B" | "C";

export interface PriceBands {
  minCents: number;
  maxCents: number;
}

export function priceBands(pricesCents: number[]): PriceBands | null {
  if (pricesCents.length === 0) return null;
  return { minCents: Math.min(...pricesCents), maxCents: Math.max(...pricesCents) };
}

export function bandOf(priceCents: number, bands: PriceBands): PriceBandKey {
  const span = bands.maxCents - bands.minCents;
  const offset3 = (priceCents - bands.minCents) * 3;
  if (span === 0 || offset3 < span) return "A";
  if (offset3 < span * 2) return "B";
  return "C";
}

export function quoteBalance(sizeSqm: number) {
  const priceCents = standPriceCents(sizeSqm);
  const downCents = PRICING.downPaymentUsd * 100;
  const balanceCents = Math.max(0, priceCents - downCents);
  const monthlyCents = Math.round(balanceCents / TERM_MONTHS);
  return {
    priceCents,
    downCents,
    legalFeeCents: PRICING.legalFeeUsd * 100,
    dueNowCents: DUE_NOW_CENTS,
    balanceCents,
    monthlyCents,
    finalMonthlyCents: balanceCents - monthlyCents * (TERM_MONTHS - 1),
    termMonths: TERM_MONTHS,
  };
}
