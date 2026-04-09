/** Canonical Google Sheet tab for a payment term (months): `Collection Schedule - {N}mo` (e.g. `Collection Schedule - 36mo`). */
export const collectionScheduleTabName = (months: number): string => {
  const n = Number.isFinite(months) && months > 0 ? Math.round(months) : 36;
  return `Collection Schedule - ${n}mo`;
};

const TAB_REGEX_MO = /^Collection Schedule - (\d+)mo$/i;
/** Legacy transition name; still accepted until sheets are renamed. */
const TAB_REGEX_MONTHS_LEGACY = /^Collection Schedule - (\d+) Months$/i;

export const parseCollectionScheduleTabMonths = (title: string): number | null => {
  const s = String(title ?? "").trim();
  let m = s.match(TAB_REGEX_MO);
  if (!m) m = s.match(TAB_REGEX_MONTHS_LEGACY);
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
  'Tab must be named like "Collection Schedule - 36mo" (legacy "Collection Schedule - N Months" and "Collection Schedule 1" are still accepted until renamed).';
