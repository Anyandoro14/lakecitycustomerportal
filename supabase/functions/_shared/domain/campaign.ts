// Campaign-level settings. Values marked TBC must be confirmed by LakeCity before go-live.

export const CAMPAIGN = {
  /** Campaign instalment term (decided: 48 months). Used by the offer form, schedule and copy. */
  termMonths: 48,
  /** Prices are VAT-inclusive. */
  vatRatePercent: 15.5,
  /** Instalment due day of month: 5th or 1st. Standard due day TBC. */
  dueDay: 5 as 1 | 5,
  /** Non-refundable Agreement of Sale preparation fee payable to Chigwanda Legal Practitioners. */
  aosFeeUsd: 500,
  aosFeePayee: "Chigwanda Legal Practitioners",
  consecutiveMissedPaymentsBeforeReallocation: 3,
  /**
   * Stand prices/deposits are TBC. Until real figures are loaded, the offer and schedule use these
   * DEMO figures so the flow can be exercised. They are always labelled PLACEHOLDER in the UI/PDFs.
   */
  placeholderPricing: { priceUsd: 25000, depositUsd: 2500, sizeSqm: 300 },
};

export interface ResolvedPricing {
  priceUsd: number;
  depositUsd: number;
  sizeSqm: number | null;
  isPlaceholder: boolean;
}

export function resolvePricing(stand: { priceUsd: number | null; depositUsd: number | null; sizeSqm: number | null }): ResolvedPricing {
  if (stand.priceUsd === null || stand.depositUsd === null) {
    return { ...CAMPAIGN.placeholderPricing, isPlaceholder: true };
  }
  return { priceUsd: stand.priceUsd, depositUsd: stand.depositUsd, sizeSqm: stand.sizeSqm, isPlaceholder: false };
}
