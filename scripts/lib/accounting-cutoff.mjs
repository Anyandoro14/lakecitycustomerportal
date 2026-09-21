/**
 * LakeCity BNPL accounting start helpers.
 *
 * Books start on DEFAULT_ACCOUNTING_START_DATE (configurable via env / callers).
 * Pre-start cash is posted on the start date to Retained Earnings (opening equity),
 * not to live bank (CABS). Post-start receipts hit the mapped bank/cash account.
 *
 * Dates from Collection Schedule / Sales Master prefer day-first (en-GB / Zimbabwe).
 */

export const DEFAULT_ACCOUNTING_START_DATE = "2026-01-01";

/** GL codes used by cutover + collections posting (Lake City CoA). */
export const ACCOUNT_CODES = Object.freeze({
  bank_cabs_usd_main: "101410",
  bank_cabs_zig: "101411",
  bank_cabs_waltich: "101412",
  bank_cabs_savings_usd: "101413",
  bank_cabs_lytton_usd: "101414",
  retained_earnings: "303000",
  opening_balance_equity: "305000",
  receivable: "121000",
  contract_liability: "212010",
  deferred_vat: "251020",
  revenue: "401000",
  vat_output: "251010",
});

/**
 * Payment source / method → default liquidity account code for live (post-cutoff) receipts.
 * Journals in Odoo should point default_account_id at these codes when configured.
 *
 * Operators may override per company via Odoo journal fields; this map is the documented default.
 */
export const PAYMENT_SOURCE_LIQUIDITY = Object.freeze({
  bank_transfer: ACCOUNT_CODES.bank_cabs_usd_main,
  card: ACCOUNT_CODES.bank_cabs_usd_main,
  paystack: ACCOUNT_CODES.bank_cabs_usd_main,
  paypal: ACCOUNT_CODES.bank_cabs_usd_main,
  flutterwave: ACCOUNT_CODES.bank_cabs_usd_main,
  odoo: ACCOUNT_CODES.bank_cabs_usd_main,
  manual: ACCOUNT_CODES.bank_cabs_usd_main,
  cash: ACCOUNT_CODES.bank_cabs_usd_main, // override with cash journal when configured
  ecocash: ACCOUNT_CODES.bank_cabs_usd_main,
  mobile_money: ACCOUNT_CODES.bank_cabs_usd_main,
  kuva: ACCOUNT_CODES.bank_cabs_usd_main,
});

export function resolveAccountingStartDate(raw) {
  const t = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : DEFAULT_ACCOUNTING_START_DATE;
}

/** True when a receipt must not post as its own live bank JE (books start on startDate). */
export function isPreAccountingStart(paymentDate, startDate) {
  const start = resolveAccountingStartDate(startDate);
  const d = String(paymentDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return d < start;
}

/**
 * Opening paid = the fuller of individual pre-start receipts vs an existing
 * opening-balance lump (avoids double-count when both exist after a re-sync).
 */
export function openingPaidFromBuckets(individualPreCutoff, existingLump) {
  const pre = Number(individualPreCutoff) || 0;
  const lump = Number(existingLump) || 0;
  if (pre <= 0) return lump > 0 ? lump : 0;
  if (lump <= 0) return pre;
  return Math.max(pre, lump);
}

/**
 * Debit account for a receipt JE given the economic payment date and cutover rules.
 *
 * @returns {{ accountCode: string, kind: "retained_earnings"|"bank", postingDate: string, notes: string }}
 */
export function selectReceiptDebitAccount(paymentDate, opts = {}) {
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

/** Normalize stand identifiers for joins across sheets / Odoo. */
export function normStand(raw) {
  const s = String(raw ?? "")
    .trim()
    .replace(/^#/, "");
  if (!s) return "";
  const n = Number.parseFloat(s);
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return s.toUpperCase();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toIso(y, m, d) {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (y < 1900 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const MONTH_NAME = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

/**
 * Parse a sheet/CSV date string preferring day-first (dd/MM/yyyy, en-GB).
 *
 * Never silently applies US mm/dd for slash-separated numeric dates.
 * When both day-first and month-first would yield valid but different dates,
 * prefers day-first and sets `dayMonthSwapSuspicion`.
 *
 * @returns {{
 *   iso: string|null,
 *   ok: boolean,
 *   ambiguous: boolean,
 *   dayMonthSwapSuspicion: boolean,
 *   unparseable: boolean,
 *   preferredOrder: "day-first"|"iso"|"excel"|"month-name"|"none",
 *   usAltIso: string|null,
 *   raw: string,
 *   notes: string[],
 * }}
 */
export function parseSheetDate(raw, opts = {}) {
  const notes = [];
  const empty = {
    iso: null,
    ok: false,
    ambiguous: false,
    dayMonthSwapSuspicion: false,
    unparseable: true,
    preferredOrder: "none",
    usAltIso: null,
    raw: "",
    notes,
  };

  if (raw == null) return empty;

  // Excel serial (days since 1899-12-30)
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const epoch = Date.UTC(1899, 11, 30);
    const dt = new Date(epoch + Math.trunc(raw) * 86400000);
    const iso = toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    notes.push(`excel-serial ${raw}`);
    return {
      iso,
      ok: Boolean(iso),
      ambiguous: false,
      dayMonthSwapSuspicion: false,
      unparseable: !iso,
      preferredOrder: "excel",
      usAltIso: null,
      raw: String(raw),
      notes,
    };
  }

  if (raw instanceof Date && !Number.isNaN(+raw)) {
    const iso = toIso(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
    return {
      iso,
      ok: Boolean(iso),
      ambiguous: false,
      dayMonthSwapSuspicion: false,
      unparseable: !iso,
      preferredOrder: "iso",
      usAltIso: null,
      raw: raw.toISOString(),
      notes,
    };
  }

  let t = String(raw).trim();
  if (!t) return empty;
  // OCR / sheet typos: leading I/l for 1
  t = t.replace(/^I\s+/i, "1 ").replace(/^l\s+/i, "1 ");
  const rawStr = t;

  // ISO / SQL
  const isoMatch = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const iso = toIso(+isoMatch[1], +isoMatch[2], +isoMatch[3]);
    return {
      iso,
      ok: Boolean(iso),
      ambiguous: false,
      dayMonthSwapSuspicion: false,
      unparseable: !iso,
      preferredOrder: "iso",
      usAltIso: null,
      raw: rawStr,
      notes,
    };
  }

  // "5 January 2026" / "5 Jan 2026"
  const named = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (named) {
    const mon = MONTH_NAME[named[2].toLowerCase()];
    const iso = mon ? toIso(+named[3], mon, +named[1]) : null;
    if (iso) {
      return {
        iso,
        ok: true,
        ambiguous: false,
        dayMonthSwapSuspicion: false,
        unparseable: false,
        preferredOrder: "month-name",
        usAltIso: null,
        raw: rawStr,
        notes,
      };
    }
  }

  // Numeric with separators: prefer day-first
  const slash = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (slash) {
    const a = +slash[1];
    const b = +slash[2];
    const y = +slash[3];
    const dayFirst = toIso(y, b, a);
    const monthFirst = toIso(y, a, b);
    const bothValid = Boolean(dayFirst && monthFirst);
    const conflict = bothValid && dayFirst !== monthFirst;

    // Prefer day-first always for Zimbabwe/UK sheets
    let iso = dayFirst;
    let preferredOrder = "day-first";
    let ambiguous = false;
    let dayMonthSwapSuspicion = false;

    if (!dayFirst && monthFirst) {
      // Only US order is calendar-valid (e.g. 13/02/2026 — day 13 cannot be month)
      iso = monthFirst;
      preferredOrder = "day-first"; // still flag — unexpected
      notes.push("day-first invalid; fell back to month-first");
      dayMonthSwapSuspicion = true;
      ambiguous = true;
    } else if (conflict) {
      ambiguous = true;
      dayMonthSwapSuspicion = true;
      notes.push(`ambiguous slash date; preferring dd/MM → ${dayFirst} (US alt ${monthFirst})`);
    } else if (dayFirst) {
      notes.push("parsed as dd/MM/yyyy");
    } else {
      notes.push("slash date unparseable");
    }

    return {
      iso: iso || null,
      ok: Boolean(iso),
      ambiguous,
      dayMonthSwapSuspicion,
      unparseable: !iso,
      preferredOrder,
      usAltIso: conflict ? monthFirst : null,
      raw: rawStr,
      notes,
    };
  }

  // Deliberately avoid `new Date("01/02/2026")` — Node/V8 treats slash dates as US.
  if (opts.allowNativeFallback) {
    const fallback = new Date(t);
    if (!Number.isNaN(+fallback)) {
      notes.push("native Date fallback (discouraged)");
      const iso = toIso(fallback.getFullYear(), fallback.getMonth() + 1, fallback.getDate());
      return {
        iso,
        ok: Boolean(iso),
        ambiguous: true,
        dayMonthSwapSuspicion: /[\/]/.test(t),
        unparseable: !iso,
        preferredOrder: "none",
        usAltIso: null,
        raw: rawStr,
        notes,
      };
    }
  }

  notes.push("unparseable date");
  return {
    ...empty,
    raw: rawStr,
    notes,
  };
}

/** Convenience: ISO string or null (day-first). */
export function parseSheetDateIso(raw) {
  return parseSheetDate(raw).iso;
}

/**
 * Detect whether two ISO dates look like a day/month swap of the same components.
 */
export function looksLikeDayMonthSwap(isoA, isoB) {
  const a = String(isoA || "").slice(0, 10);
  const b = String(isoB || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return false;
  if (a === b) return false;
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return ya === yb && ma === db && da === mb;
}
