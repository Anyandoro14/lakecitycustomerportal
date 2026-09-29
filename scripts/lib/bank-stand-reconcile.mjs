/**
 * Three-way stand check for bank-statement auto-reconcile.
 *
 * Agree on ALL THREE (normalized stand) + amount within tolerance:
 *   1. stand on portal / BNPL payment
 *   2. stand on partner / loan contract
 *   3. stand extracted from bank transaction label/ref
 */

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

/**
 * Extract a stand token from bank narration / payment_ref / label.
 * Accepts: "Stand 26", "ST 26", "ST-26", "#26", "stand:26".
 * Requires a leading digit so plain English like "stand here" is ignored.
 */
export function extractStandFromBankText(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";

  const patterns = [
    /\bstand\s*[#:\-]?\s*(\d+[A-Za-z0-9]*)\b/i,
    /\bst\s*[#:\-]?\s*(\d+[A-Za-z0-9]*)\b/i,
    /#\s*(\d+[A-Za-z0-9]*)\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const n = normStand(m[1]);
      if (n) return n;
    }
  }
  return "";
}

/**
 * @returns {{ ok: boolean, reason?: string, stand_portal: string, stand_partner: string, stand_bank: string }}
 */
export function threeWayStandCheck({
  standPortal,
  standPartner,
  standBank,
  amountPayment,
  amountBank,
  tolerance = 0.01,
} = {}) {
  const stand_portal = normStand(standPortal);
  const stand_partner = normStand(standPartner);
  // Prefer explicit stand extraction from bank narration; fall back to bare ids.
  const stand_bank =
    extractStandFromBankText(standBank) ||
    (String(standBank || "").trim().match(/^[A-Za-z0-9]+$/)
      ? normStand(standBank)
      : "");

  const result = {
    ok: false,
    stand_portal,
    stand_partner,
    stand_bank,
  };

  if (!stand_portal || !stand_partner || !stand_bank) {
    result.reason = "missing_stand";
    return result;
  }
  if (stand_portal !== stand_partner || stand_portal !== stand_bank) {
    result.reason = "stand_mismatch";
    return result;
  }

  const pay = Number(amountPayment);
  const bank = Number(amountBank);
  if (!Number.isFinite(pay) || !Number.isFinite(bank)) {
    result.reason = "amount_unparseable";
    return result;
  }
  const tol = Number.isFinite(Number(tolerance)) ? Math.abs(Number(tolerance)) : 0.01;
  if (Math.abs(pay - bank) > tol) {
    result.reason = "amount_mismatch";
    return result;
  }

  result.ok = true;
  return result;
}
