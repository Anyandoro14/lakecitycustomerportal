/** Canonical Google Sheet tab for a payment term (months). */
export const collectionScheduleTabName = (months: number): string => {
  const n = Number.isFinite(months) && months > 0 ? Math.round(months) : 36;
  return `Collection Schedule - ${n} Months`;
};

const TAB_REGEX = /^Collection Schedule - (\d+) Months$/i;

export const parseCollectionScheduleTabMonths = (title: string): number | null => {
  const m = String(title ?? "").trim().match(TAB_REGEX);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const isValidCollectionTabName = (title: string): boolean => {
  const t = String(title).trim();
  if (t === "Collection Schedule 1") return true; // legacy until renamed
  return parseCollectionScheduleTabMonths(t) != null;
};

export const TAB_NAME_ERROR =
  'Tab must be named like "Collection Schedule - 36 Months" (legacy "Collection Schedule 1" is still accepted until renamed).';
