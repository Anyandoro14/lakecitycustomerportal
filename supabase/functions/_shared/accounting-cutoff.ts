export const DEFAULT_ACCOUNTING_START_DATE = "2026-01-01";

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
