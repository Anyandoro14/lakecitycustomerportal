/**
 * Three-way customer balance reconciliation:
 * Google Sheets (Master Sales / Collection Schedule) ↔ Odoo ↔ StandLedger portal.
 *
 * Sign convention: discrepancy = left − right.
 * Positive  → left outstanding is higher (customer appears to owe more on the left source).
 * Negative  → left outstanding is lower  (customer appears to owe less on the left source).
 */

export const DEFAULT_BALANCE_TOLERANCE = 0.01;

export type ReconciliationSource = "sheets" | "odoo" | "standledger";

export type LedgerAmounts = {
  standNumber: string;
  customerName: string;
  email?: string;
  totalPrice: number;
  deposit: number;
  totalPaid: number;
  currentBalance: number;
  sheetTab?: string;
  extras?: Record<string, number | string | boolean | null>;
};

export type ReconciledStand = {
  standNumber: string;
  customerName: string;
  email: string;
  sheets: LedgerAmounts | null;
  odoo: LedgerAmounts | null;
  standledger: LedgerAmounts | null;
  sheetsVsOdooBalance: number | null;
  sheetsVsStandledgerBalance: number | null;
  odooVsStandledgerBalance: number | null;
  sheetsVsOdooPaid: number | null;
  sheetsVsStandledgerPaid: number | null;
  odooVsStandledgerPaid: number | null;
  status: "match" | "variance" | "missing_source";
  likelyCause: string;
  likelySource: ReconciliationSource | "multiple" | "none";
};

export type ReconciliationSummary = {
  asOf: string;
  tolerance: number;
  standsCompared: number;
  matched: number;
  variances: number;
  missingSource: number;
  sheetsCount: number;
  odooCount: number;
  standledgerCount: number;
  positiveDiscrepancies: number;
  negativeDiscrepancies: number;
  absVarianceTotal: number;
};

export type ReconciliationResult = {
  summary: ReconciliationSummary;
  rows: ReconciledStand[];
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parseMoney(val: unknown): number {
  if (val == null || val === "") return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const cleaned = val.toString().replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export function moneyEq(a: number, b: number, tolerance = DEFAULT_BALANCE_TOLERANCE): boolean {
  return Math.abs(round2(a) - round2(b)) <= tolerance;
}

export function signedDelta(
  left: number | null | undefined,
  right: number | null | undefined,
): number | null {
  if (left == null || right == null) return null;
  return round2(left - right);
}

export function formatSignedMoney(delta: number | null): string {
  if (delta == null) return "—";
  const abs = Math.abs(delta).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
  if (delta > 0) return `+${abs}`;
  if (delta < 0) return `−${abs.replace("$-", "$")}`;
  return abs;
}

function indexByStand(rows: LedgerAmounts[]): Map<string, LedgerAmounts> {
  const map = new Map<string, LedgerAmounts>();
  for (const row of rows) {
    const key = normalizeStand(row.standNumber);
    if (!key) continue;
    map.set(key, { ...row, standNumber: key });
  }
  return map;
}

export function normalizeStand(raw: unknown): string {
  return (raw ?? "").toString().trim().toUpperCase();
}

function pickName(sheets?: LedgerAmounts | null, odoo?: LedgerAmounts | null, portal?: LedgerAmounts | null): string {
  return (
    sheets?.customerName ||
    odoo?.customerName ||
    portal?.customerName ||
    ""
  ).trim();
}

function pickEmail(sheets?: LedgerAmounts | null, odoo?: LedgerAmounts | null, portal?: LedgerAmounts | null): string {
  return (sheets?.email || odoo?.email || portal?.email || "").trim();
}

function diagnose(row: Omit<ReconciledStand, "likelyCause" | "likelySource" | "status" | "customerName" | "email">): {
  status: ReconciledStand["status"];
  likelyCause: string;
  likelySource: ReconciledStand["likelySource"];
} {
  const { sheets, odoo, standledger } = row;
  const present = [sheets, odoo, standledger].filter(Boolean).length;

  if (present === 0) {
    return {
      status: "missing_source",
      likelyCause: "Stand key produced an empty comparison (no source rows).",
      likelySource: "none",
    };
  }

  if (!sheets && odoo && standledger) {
    return {
      status: "missing_source",
      likelyCause:
        "Present in Odoo and StandLedger but missing from the Master Sales / Collection Schedule. Likely a stand-number mismatch on the sheet, or the sale was booked in Odoo without a Collection Schedule row.",
      likelySource: "sheets",
    };
  }
  if (sheets && !odoo && standledger) {
    return {
      status: "missing_source",
      likelyCause:
        "Present on Master Sales / Collection Schedule and StandLedger but missing from Odoo. Likely the BNPL loan contract was never upserted, uses a different stand number, or is still draft/cancelled.",
      likelySource: "odoo",
    };
  }
  if (sheets && odoo && !standledger) {
    return {
      status: "missing_source",
      likelyCause:
        "Present on Master Sales and in Odoo but no customer-facing StandLedger ledger row. Likely the stand is not portal-enrolled, or the portal database has no contract / approved receipts for this stand.",
      likelySource: "standledger",
    };
  }
  if (sheets && !odoo && !standledger) {
    return {
      status: "missing_source",
      likelyCause:
        "Only on Master Sales / Collection Schedule. Odoo contract and StandLedger portal ledger are both missing — typical for unsynced sales or a sheet-only stand.",
      likelySource: "multiple",
    };
  }
  if (!sheets && odoo && !standledger) {
    return {
      status: "missing_source",
      likelyCause:
        "Only in Odoo. Missing from Master Sales and StandLedger — check stand number on the loan contract versus Column B of the Collection Schedule, and portal enrolment.",
      likelySource: "multiple",
    };
  }
  if (!sheets && !odoo && standledger) {
    return {
      status: "missing_source",
      likelyCause:
        "Only on the StandLedger portal ledger. Missing from Master Sales and Odoo — portal receipts/contracts may use a stand number that does not match the sheet or Odoo.",
      likelySource: "multiple",
    };
  }

  // All three present
  const s = sheets!;
  const o = odoo!;
  const p = standledger!;

  const priceSheetOdoo = !moneyEq(s.totalPrice, o.totalPrice);
  const priceSheetPortal = !moneyEq(s.totalPrice, p.totalPrice);
  const depositSheetOdoo = !moneyEq(s.deposit, o.deposit);
  const depositSheetPortal = !moneyEq(s.deposit, p.deposit);
  const paidSheetOdoo = !moneyEq(s.totalPaid, o.totalPaid);
  const paidSheetPortal = !moneyEq(s.totalPaid, p.totalPaid);
  const paidOdooPortal = !moneyEq(o.totalPaid, p.totalPaid);
  const balSheetOdoo = !moneyEq(s.currentBalance, o.currentBalance);
  const balSheetPortal = !moneyEq(s.currentBalance, p.currentBalance);
  const balOdooPortal = !moneyEq(o.currentBalance, p.currentBalance);

  const anyVariance =
    priceSheetOdoo ||
    priceSheetPortal ||
    depositSheetOdoo ||
    depositSheetPortal ||
    paidSheetOdoo ||
    paidSheetPortal ||
    paidOdooPortal ||
    balSheetOdoo ||
    balSheetPortal ||
    balOdooPortal;

  if (!anyVariance) {
    return {
      status: "match",
      likelyCause: "All three sources agree on sale price, deposit, total paid, and current balance within tolerance.",
      likelySource: "none",
    };
  }

  const parts: string[] = [];
  let likely: ReconciledStand["likelySource"] = "multiple";

  if (priceSheetOdoo) {
    const d = round2(s.totalPrice - o.totalPrice);
    parts.push(
      `Sale price differs (Sheets ${fmt(s.totalPrice)} vs Odoo ${fmt(o.totalPrice)}, ${formatSignedMoney(d)}). ` +
        "Often VAT inclusive vs exclusive: Odoo `total_with_tax` should match sheet TOTAL PRICE when the sheet is VAT-inclusive.",
    );
    likely = "odoo";
  }

  if (depositSheetOdoo || depositSheetPortal) {
    parts.push(
      `Deposit differs (Sheets ${fmt(s.deposit)}, Odoo ${fmt(o.deposit)}, StandLedger ${fmt(p.deposit)}). ` +
        "Check Collection Schedule Column H versus Odoo deposit_amount. A missed or double-counted deposit moves the outstanding balance by the same amount.",
    );
    likely = depositSheetOdoo && !depositSheetPortal ? "odoo" : "sheets";
  }

  if (paidSheetOdoo || paidSheetPortal || paidOdooPortal) {
    const so = signedDelta(s.totalPaid, o.totalPaid);
    const sp = signedDelta(s.totalPaid, p.totalPaid);
    parts.push(
      `Payment receipts differ (Sheets paid ${fmt(s.totalPaid)}, Odoo ${fmt(o.totalPaid)}, StandLedger ${fmt(p.totalPaid)}). ` +
        describePaidCause(so, sp),
    );
    if (paidSheetOdoo && paidSheetPortal && moneyEq(o.totalPaid, p.totalPaid)) {
      likely = "sheets";
    } else if (paidSheetOdoo && paidOdooPortal && moneyEq(s.totalPaid, p.totalPaid)) {
      likely = "odoo";
    } else if (paidSheetPortal && paidOdooPortal && moneyEq(s.totalPaid, o.totalPaid)) {
      likely = "standledger";
    } else {
      likely = "multiple";
    }
  }

  if ((balSheetOdoo || balSheetPortal || balOdooPortal) && !paidSheetOdoo && !paidSheetPortal && !priceSheetOdoo && !depositSheetOdoo) {
    parts.push(
      `Balances differ even though price/deposit/paid line up. Expected outstanding ≈ sale price − total paid. ` +
        `Sheets ${fmt(s.currentBalance)}, Odoo ${fmt(o.currentBalance)}, StandLedger ${fmt(p.currentBalance)}. ` +
        "Likely a Current Balance formula error on the sheet, or Odoo using total_with_tax while the sheet uses net price.",
    );
    likely = "sheets";
  } else if (balSheetOdoo || balSheetPortal || balOdooPortal) {
    const so = signedDelta(s.currentBalance, o.currentBalance);
    const sp = signedDelta(s.currentBalance, p.currentBalance);
    parts.push(describeBalanceSign(so, sp));
  }

  return {
    status: "variance",
    likelyCause: parts.join(" "),
    likelySource: likely,
  };
}

function describePaidCause(sheetsVsOdoo: number | null, sheetsVsPortal: number | null): string {
  const bits: string[] = [];
  if (sheetsVsOdoo != null && Math.abs(sheetsVsOdoo) > DEFAULT_BALANCE_TOLERANCE) {
    if (sheetsVsOdoo > 0) {
      bits.push(
        `Sheets total paid is higher than Odoo by ${formatSignedMoney(sheetsVsOdoo)} — receipts on the Collection Schedule (or deposit) may not have posted to Odoo (sync skip, pre-cutover, or QC not approved).`,
      );
    } else {
      bits.push(
        `Odoo total paid is higher than Sheets by ${formatSignedMoney(Math.abs(sheetsVsOdoo))} — an Odoo payment (or opening-balance lump) is not on the Collection Schedule monthly grid.`,
      );
    }
  }
  if (sheetsVsPortal != null && Math.abs(sheetsVsPortal) > DEFAULT_BALANCE_TOLERANCE) {
    if (sheetsVsPortal > 0) {
      bits.push(
        `Sheets total paid is higher than StandLedger portal receipts by ${formatSignedMoney(sheetsVsPortal)} — manual sheet entries or deposits may not be in approved payment_receipts.`,
      );
    } else {
      bits.push(
        `StandLedger portal receipts exceed the Collection Schedule by ${formatSignedMoney(Math.abs(sheetsVsPortal))} — approved receipts not yet written to the sheet (customer-visible balance still follows the sheet).`,
      );
    }
  }
  return bits.join(" ") || "Review deposits and payment receipts across all three ledgers.";
}

function describeBalanceSign(sheetsVsOdoo: number | null, sheetsVsPortal: number | null): string {
  const bits: string[] = [];
  if (sheetsVsOdoo != null && Math.abs(sheetsVsOdoo) > DEFAULT_BALANCE_TOLERANCE) {
    if (sheetsVsOdoo > 0) {
      bits.push(
        `Positive discrepancy vs Odoo (${formatSignedMoney(sheetsVsOdoo)}): Master Sales outstanding is higher — customer appears to owe more on the sheet than in Odoo.`,
      );
    } else {
      bits.push(
        `Negative discrepancy vs Odoo (${formatSignedMoney(sheetsVsOdoo)}): Master Sales outstanding is lower — customer appears to owe less on the sheet than in Odoo.`,
      );
    }
  }
  if (sheetsVsPortal != null && Math.abs(sheetsVsPortal) > DEFAULT_BALANCE_TOLERANCE) {
    if (sheetsVsPortal > 0) {
      bits.push(
        `Positive discrepancy vs StandLedger (${formatSignedMoney(sheetsVsPortal)}): customer-facing / portal outstanding is lower than the sheet.`,
      );
    } else {
      bits.push(
        `Negative discrepancy vs StandLedger (${formatSignedMoney(sheetsVsPortal)}): customer-facing / portal outstanding is higher than the sheet.`,
      );
    }
  }
  return bits.join(" ");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

export function reconcileLedgers(
  sheetsRows: LedgerAmounts[],
  odooRows: LedgerAmounts[],
  standledgerRows: LedgerAmounts[],
  options: { tolerance?: number; asOf?: string } = {},
): ReconciliationResult {
  const tolerance = options.tolerance ?? DEFAULT_BALANCE_TOLERANCE;
  const sheets = indexByStand(sheetsRows);
  const odoo = indexByStand(odooRows);
  const portal = indexByStand(standledgerRows);

  const stands = new Set<string>([...sheets.keys(), ...odoo.keys(), ...portal.keys()]);
  const rows: ReconciledStand[] = [];

  for (const standNumber of [...stands].sort()) {
    const s = sheets.get(standNumber) ?? null;
    const o = odoo.get(standNumber) ?? null;
    const p = portal.get(standNumber) ?? null;

    const base = {
      standNumber,
      sheets: s,
      odoo: o,
      standledger: p,
      sheetsVsOdooBalance: signedDelta(s?.currentBalance, o?.currentBalance),
      sheetsVsStandledgerBalance: signedDelta(s?.currentBalance, p?.currentBalance),
      odooVsStandledgerBalance: signedDelta(o?.currentBalance, p?.currentBalance),
      sheetsVsOdooPaid: signedDelta(s?.totalPaid, o?.totalPaid),
      sheetsVsStandledgerPaid: signedDelta(s?.totalPaid, p?.totalPaid),
      odooVsStandledgerPaid: signedDelta(o?.totalPaid, p?.totalPaid),
    };

    const diag = diagnose(base);
    rows.push({
      ...base,
      customerName: pickName(s, o, p),
      email: pickEmail(s, o, p),
      ...diag,
    });
  }

  let matched = 0;
  let variances = 0;
  let missingSource = 0;
  let positiveDiscrepancies = 0;
  let negativeDiscrepancies = 0;
  let absVarianceTotal = 0;

  for (const row of rows) {
    if (row.status === "match") matched += 1;
    else if (row.status === "variance") variances += 1;
    else missingSource += 1;

    const deltas = [
      row.sheetsVsOdooBalance,
      row.sheetsVsStandledgerBalance,
      row.odooVsStandledgerBalance,
    ].filter((d): d is number => d != null && Math.abs(d) > tolerance);

    for (const d of deltas) {
      if (d > 0) positiveDiscrepancies += 1;
      if (d < 0) negativeDiscrepancies += 1;
      absVarianceTotal += Math.abs(d);
    }
  }

  return {
    summary: {
      asOf: options.asOf ?? new Date().toISOString(),
      tolerance,
      standsCompared: rows.length,
      matched,
      variances,
      missingSource,
      sheetsCount: sheets.size,
      odooCount: odoo.size,
      standledgerCount: portal.size,
      positiveDiscrepancies,
      negativeDiscrepancies,
      absVarianceTotal: round2(absVarianceTotal),
    },
    rows,
  };
}

export function varianceRows(result: ReconciliationResult): ReconciledStand[] {
  return result.rows.filter((r) => r.status !== "match");
}
