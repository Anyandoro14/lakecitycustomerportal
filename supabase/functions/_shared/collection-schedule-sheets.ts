/**
 * Collection Schedule tab naming and resolution (Google Sheets).
 *
 * Canonical tab title: "Collection Schedule - {N} Months" (e.g. "Collection Schedule - 36 Months").
 * Legacy: "Collection Schedule 1" is treated as the 36-month Richcraft tab until renamed.
 */

export const DEFAULT_PAYMENT_PLAN_MONTHS = 36;

export type SheetProperties = { title?: string; sheetId?: number };

export type SheetMeta = { properties: SheetProperties };

/** Exact canonical name for a term length. */
export function collectionScheduleTabName(months: number): string {
  const n = Number.isFinite(months) && months > 0 ? Math.round(months) : DEFAULT_PAYMENT_PLAN_MONTHS;
  return `Collection Schedule - ${n} Months`;
}

const TAB_REGEX = /^Collection Schedule - (\d+) Months$/i;

export function parseCollectionScheduleTabMonths(title: string): number | null {
  const m = String(title ?? "").trim().match(TAB_REGEX);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isLegacyCollectionSchedule1(title: string): boolean {
  return String(title ?? "").trim() === "Collection Schedule 1";
}

/** Column M (0-based index 12) through last monthly column for N months. */
export function paymentColumnBounds(months: number): { start: number; end: number } {
  const n = Number.isFinite(months) && months > 0 ? Math.round(months) : DEFAULT_PAYMENT_PLAN_MONTHS;
  const start = 12; // M
  const end = 12 + n - 1;
  return { start, end };
}

/** Escape sheet title for A1 notation (wrap in single quotes, escape quotes). */
export function quoteSheetRange(sheetTitle: string, a1Rest: string): string {
  const safe = String(sheetTitle).replace(/'/g, "''");
  return `'${safe}'!${a1Rest}`;
}

/**
 * Titles that are Collection Schedule data tabs (not Receipts_Intake, etc.).
 */
export function listCollectionScheduleDataTabTitles(sheets: SheetMeta[]): string[] {
  const out: string[] = [];
  for (const s of sheets) {
    const t = s.properties?.title;
    if (!t) continue;
    if (t === "Receipts_Intake" || t === "Payments_Ledger" || t === "TEMPLATE_INSTRUCTIONS") continue;
    if (parseCollectionScheduleTabMonths(t) != null || isLegacyCollectionSchedule1(t)) {
      out.push(t);
    }
  }
  return out;
}

export function resolveCollectionScheduleSheetTitle(
  sheets: SheetMeta[],
  options: {
    paymentPlanMonths?: number | null;
    envPreferredName?: string | null;
    envPreferredGid?: string | null;
  },
): { sheetTitle: string; resolvedMonths: number; source: string } {
  const list = sheets || [];

  const envName = options.envPreferredName?.trim();
  if (envName) {
    const hit = list.find((s) => s.properties?.title === envName);
    if (hit?.properties?.title) {
      const m = parseCollectionScheduleTabMonths(hit.properties.title);
      return {
        sheetTitle: hit.properties.title,
        resolvedMonths: m ?? DEFAULT_PAYMENT_PLAN_MONTHS,
        source: "SHEET_NAME",
      };
    }
  }

  const envGid = options.envPreferredGid?.trim();
  if (envGid) {
    const hit = list.find((s) => String(s.properties?.sheetId) === envGid);
    if (hit?.properties?.title) {
      const m = parseCollectionScheduleTabMonths(hit.properties.title);
      return {
        sheetTitle: hit.properties.title,
        resolvedMonths: m ?? DEFAULT_PAYMENT_PLAN_MONTHS,
        source: "SHEET_GID",
      };
    }
  }

  const months =
    options.paymentPlanMonths != null && options.paymentPlanMonths > 0
      ? Math.round(options.paymentPlanMonths)
      : DEFAULT_PAYMENT_PLAN_MONTHS;

  const canonical = collectionScheduleTabName(months);
  const byExact = list.find((s) => s.properties?.title === canonical);
  if (byExact?.properties?.title) {
    return { sheetTitle: byExact.properties.title, resolvedMonths: months, source: "canonical" };
  }

  if (months === DEFAULT_PAYMENT_PLAN_MONTHS) {
    const legacy = list.find((s) => isLegacyCollectionSchedule1(s.properties?.title ?? ""));
    if (legacy?.properties?.title) {
      return { sheetTitle: legacy.properties.title, resolvedMonths: months, source: "legacy_collection_schedule_1" };
    }
  }

  const byNorm = list.find(
    (s) => s.properties?.title?.trim().toLowerCase() === canonical.toLowerCase(),
  );
  if (byNorm?.properties?.title) {
    return { sheetTitle: byNorm.properties.title, resolvedMonths: months, source: "canonical_case_insensitive" };
  }

  return { sheetTitle: canonical, resolvedMonths: months, source: "missing" };
}

/** 0-based column index → Excel column letters (A, B, …, Z, AA, …). */
export function columnIndexToA1Letter(zeroBasedIndex: number): string {
  let n = zeroBasedIndex + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Locate stand in Column B across Collection Schedule tabs. */
export async function findStandRowInCollectionTabs(
  accessToken: string,
  spreadsheetId: string,
  sheets: SheetMeta[],
  standNumber: string,
): Promise<{ sheetTitle: string; row1Based: number } | null> {
  const tabs = listCollectionScheduleDataTabTitles(sheets);
  const norm = standNumber.trim().toUpperCase();
  for (const sheetTitle of tabs) {
    const range = encodeURIComponent(`${sheetTitle}!B:B`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) continue;
    const data = await response.json();
    const rows = data.values || [];
    for (let i = 1; i < rows.length; i++) {
      const v = rows[i]?.[0]?.toString().trim().toUpperCase() || "";
      if (v === norm) return { sheetTitle, row1Based: i + 1 };
    }
  }
  return null;
}
