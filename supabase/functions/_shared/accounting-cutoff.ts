/**
 * LakeCity BNPL accounting start helpers (Deno / Edge Functions).
 * Keep behaviour in sync with scripts/lib/accounting-cutoff.mjs.
 */

export const DEFAULT_ACCOUNTING_START_DATE = "2026-01-01";

export const ACCOUNT_CODES = {
  bank_cabs_usd_main: "101410",
  retained_earnings: "303000",
  opening_balance_equity: "305000",
} as const;

export const PAYMENT_SOURCE_LIQUIDITY: Record<string, string> = {
  bank_transfer: ACCOUNT_CODES.bank_cabs_usd_main,
  card: ACCOUNT_CODES.bank_cabs_usd_main,
  paystack: ACCOUNT_CODES.bank_cabs_usd_main,
  paypal: ACCOUNT_CODES.bank_cabs_usd_main,
  flutterwave: ACCOUNT_CODES.bank_cabs_usd_main,
  odoo: ACCOUNT_CODES.bank_cabs_usd_main,
  manual: ACCOUNT_CODES.bank_cabs_usd_main,
  cash: ACCOUNT_CODES.bank_cabs_usd_main,
  ecocash: ACCOUNT_CODES.bank_cabs_usd_main,
  mobile_money: ACCOUNT_CODES.bank_cabs_usd_main,
  kuva: ACCOUNT_CODES.bank_cabs_usd_main,
};

export function resolveAccountingStartDate(raw?: string | null): string {
  const t = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : DEFAULT_ACCOUNTING_START_DATE;
}

/** True when a receipt must not post as its own Odoo JE (books start on startDate). */
export function isPreAccountingStart(
  paymentDate: string | null | undefined,
  startDate?: string | null,
): boolean {
  const start = resolveAccountingStartDate(startDate);
  const d = String(paymentDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return d < start;
}

/**
 * Opening paid = the fuller of individual pre-start receipts vs an existing
 * opening-balance lump (avoids double-count when both exist after a re-sync).
 */
export function openingPaidFromBuckets(individualPreCutoff: number, existingLump: number): number {
  const pre = Number(individualPreCutoff) || 0;
  const lump = Number(existingLump) || 0;
  if (pre <= 0) return lump > 0 ? lump : 0;
  if (lump <= 0) return pre;
  return Math.max(pre, lump);
}

export function selectReceiptDebitAccount(
  paymentDate: string | null | undefined,
  opts: {
    startDate?: string | null;
    source?: string | null;
    isOpeningBalanceLump?: boolean;
    retainedEarningsCode?: string | null;
    defaultBankCode?: string | null;
  } = {},
): {
  accountCode: string;
  kind: "retained_earnings" | "bank";
  postingDate: string;
  notes: string;
} {
  const start = resolveAccountingStartDate(opts.startDate);
  const source = String(opts.source || "manual").trim().toLowerCase() || "manual";
  const isOpeningLump = Boolean(opts.isOpeningBalanceLump);
  const d = String(paymentDate || "").slice(0, 10);
  const pre = isOpeningLump || isPreAccountingStart(d, start);

  if (pre) {
    const equityCode =
      String(opts.retainedEarningsCode || "").trim() || ACCOUNT_CODES.retained_earnings;
    return {
      accountCode: equityCode,
      kind: "retained_earnings",
      postingDate: start,
      notes: `Pre-cutoff cash posted on ${start} to equity ${equityCode} (not bank)`,
    };
  }

  const bankCode =
    PAYMENT_SOURCE_LIQUIDITY[source] ||
    opts.defaultBankCode ||
    ACCOUNT_CODES.bank_cabs_usd_main;
  return {
    accountCode: bankCode,
    kind: "bank",
    postingDate: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : start,
    notes: `Live receipt → liquidity ${bankCode} via source=${source}`,
  };
}
