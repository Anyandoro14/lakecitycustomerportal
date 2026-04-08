/**
 * Validation helpers for Collection Schedule tab names.
 *
 * Canonical pattern:  "Collection Schedule - {N} Months"
 *   where N is a positive integer (12, 24, 36, 48, 60, …).
 *
 * Legacy:  "Collection Schedule 1"  is still accepted as the 36-month tab
 *   until the sheet is renamed.
 */

const LEGACY_TAB = "Collection Schedule 1";
const LEGACY_MONTHS = 36;

/** Matches "Collection Schedule - 36 Months" style titles. */
const TERM_TAB_RE = /^Collection Schedule - (\d+) Months$/;

export const TAB_NAME_ERROR =
  'Tab must be named "Collection Schedule - N Months" (e.g. Collection Schedule - 36 Months). The legacy name "Collection Schedule 1" is also accepted for the 36-month term.';

// ── builders ──────────────────────────────────────────────────────────

/** Return the canonical tab name for a given term length. */
export function collectionScheduleTabName(months: number): string {
  return `Collection Schedule - ${months} Months`;
}

// ── parsers ───────────────────────────────────────────────────────────

export interface TabParseResult {
  valid: boolean;
  months?: number;
  error?: string;
}

/** Parse a tab title and return the term-length in months (or an error). */
export function parseCollectionScheduleTabMonths(title: string): TabParseResult {
  if (title === LEGACY_TAB) {
    return { valid: true, months: LEGACY_MONTHS };
  }

  const match = title.match(TERM_TAB_RE);
  if (!match) {
    return { valid: false, error: TAB_NAME_ERROR };
  }

  const months = parseInt(match[1], 10);
  if (months <= 0) {
    return { valid: false, error: TAB_NAME_ERROR };
  }

  return { valid: true, months };
}

/** Quick boolean check for a valid tab title. */
export function isValidCollectionTabName(title: string): boolean {
  return parseCollectionScheduleTabMonths(title).valid;
}
