/**
 * LakeCity / Zimbabwe date convention: day-first (dd/mm/yyyy).
 * Prefer UK formats before US; ISO YYYY-MM-DD always wins when present.
 */

/**
 * @param {unknown} raw
 * @returns {string|null} ISO date YYYY-MM-DD or null
 */
export function parseUkPreferDate(raw) {
  if (raw == null || raw === "") return null;

  if (raw instanceof Date && !Number.isNaN(+raw)) {
    return raw.toISOString().slice(0, 10);
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Excel serial (1900 system)
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + raw * 86400000);
    if (!Number.isNaN(+d)) return d.toISOString().slice(0, 10);
    return null;
  }

  const s = String(raw).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
  }

  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy (and 2-digit year)
  const uk = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/);
  if (uk) {
    let day = Number(uk[1]);
    let month = Number(uk[2]);
    let year = Number(uk[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * True when day and month are both ≤12 and unequal — US vs UK string ambiguity.
 * @param {string} iso YYYY-MM-DD
 */
export function isDayMonthAmbiguous(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const day = Number(iso.slice(8, 10));
  const month = Number(iso.slice(5, 7));
  return day <= 12 && month <= 12 && day !== month;
}

/**
 * Swap day/month of an ISO date when both parts are valid months (≤12).
 * @param {string} iso
 * @returns {string|null}
 */
export function swapDayMonthIso(iso) {
  if (!isDayMonthAmbiguous(iso)) return null;
  const y = iso.slice(0, 4);
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return `${y}-${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}`;
}

/** Format ISO as dd/mm/yyyy for QC reports. */
export function isoToDdMmYyyy(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(iso || "");
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function normStand(raw) {
  const s = String(raw ?? "")
    .trim()
    .replace(/^#/, "");
  if (!s) return "";
  const n = Number.parseFloat(s);
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return s.toUpperCase();
}

export function parseMoney(val) {
  if (val == null || val === "") return null;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const s = String(val)
    .trim()
    .replace(/[$£€,\s]/g, "")
    .replace(/^\(/, "-")
    .replace(/\)$/, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
