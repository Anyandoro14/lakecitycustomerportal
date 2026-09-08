import { parseMoney, round2, type LedgerAmounts } from "./balance-reconciliation.ts";
import type { SheetMeta } from "./collection-schedule-sheets.ts";

/** LakeCity Master Sales workbook (sales register). */
export const DEFAULT_MASTER_SALES_SPREADSHEET_ID = "1LipmKyODkB9cBmQXCy1gd8tBcxhz6aO0";
export const DEFAULT_MASTER_SALES_SHEET_GID = "1904118601";
export const MASTER_SALES_WORKBOOK_URL =
  "https://docs.google.com/spreadsheets/d/1LipmKyODkB9cBmQXCy1gd8tBcxhz6aO0/edit?gid=1904118601";

export type MasterSalesConfig = {
  spreadsheetId: string;
  gid: string;
  title: string;
};

export function resolveMasterSalesConfig(
  env: { get(name: string): string | undefined } | Record<string, string | undefined> = {},
): MasterSalesConfig {
  const read = (key: string) => {
    if (typeof (env as { get?: (n: string) => string | undefined }).get === "function") {
      return (env as { get: (n: string) => string | undefined }).get(key) || "";
    }
    return ((env as Record<string, string | undefined>)[key] || "");
  };
  return {
    spreadsheetId: read("MASTER_SALES_SPREADSHEET_ID").trim() || DEFAULT_MASTER_SALES_SPREADSHEET_ID,
    gid: read("MASTER_SALES_SHEET_GID").trim() || DEFAULT_MASTER_SALES_SHEET_GID,
    title: read("MASTER_SALES_SHEET_TAB").trim(),
  };
}

export function findSheetTitleByGidOrName(
  sheets: SheetMeta[],
  options: { gid?: string; title?: string },
): string | null {
  const titleWanted = (options.title || "").trim();
  if (titleWanted) {
    const exact = sheets.find((s) => s.properties?.title === titleWanted);
    if (exact?.properties?.title) return exact.properties.title;
    const ci = sheets.find(
      (s) => (s.properties?.title || "").trim().toLowerCase() === titleWanted.toLowerCase(),
    );
    if (ci?.properties?.title) return ci.properties.title;
  }
  const gid = (options.gid || "").trim();
  if (gid) {
    const byGid = sheets.find((s) => String(s.properties?.sheetId ?? "") === gid);
    if (byGid?.properties?.title) return byGid.properties.title;
  }
  const named = sheets.find((s) => {
    const t = (s.properties?.title || "").trim().toLowerCase();
    return /master\s*sales/.test(t) || t === "sales master" || t === "sales list";
  });
  return named?.properties?.title || null;
}

type HeaderIndex = {
  stand: number;
  firstName: number;
  lastName: number;
  fullName: number;
  email: number;
  totalPrice: number;
  deposit: number;
  totalPaid: number;
  currentBalance: number;
};

function findHeaderIndex(headers: string[], preds: Array<(h: string) => boolean>): number {
  for (const pred of preds) {
    const idx = headers.findIndex((h) => pred((h || "").toString().trim().toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function buildLedgerHeaderIndex(headerRow: string[]): HeaderIndex {
  const h = headerRow.map((x) => (x || "").toString());
  return {
    stand: findHeaderIndex(h, [
      (s) => s.includes("stand number"),
      (s) => s.includes("stand no"),
      (s) => s === "stand" || s === "stand #",
      (s) => s.includes("plot number") || s === "plot",
    ]),
    firstName: findHeaderIndex(h, [(s) => s.includes("first name")]),
    lastName: findHeaderIndex(h, [(s) => s.includes("last name")]),
    fullName: findHeaderIndex(h, [
      (s) => s === "customer name" || s === "client name" || s === "buyer name",
      (s) => s === "full name" || s === "name",
      (s) => s === "customer" || s === "client" || s === "buyer" || s === "purchaser",
    ]),
    email: findHeaderIndex(h, [(s) => s.includes("email")]),
    totalPrice: findHeaderIndex(h, [
      (s) => s.includes("total price"),
      (s) => s.includes("purchase price") || s.includes("sale price") || s.includes("selling price"),
      (s) => s.includes("agreed price") || s.includes("contract price"),
      (s) => s === "price",
    ]),
    deposit: findHeaderIndex(h, [
      (s) => s === "deposit" || s === "deposit amount" || s.includes("down payment"),
    ]),
    totalPaid: findHeaderIndex(h, [
      (s) => s.includes("total paid") || s.includes("amount paid") || s.includes("paid to date"),
      (s) => s === "paid" || s === "cumulative paid",
    ]),
    currentBalance: findHeaderIndex(h, [
      (s) => s.includes("current balance") || s.includes("outstanding balance"),
      (s) => s.includes("amount outstanding") || s.includes("balance due"),
      (s) => s === "outstanding" || s === "remaining" || s === "balance",
    ]),
  };
}

function isJunkStand(stand: string): boolean {
  const u = stand.trim().toUpperCase();
  return !u || u === "TOTAL" || u === "TOTALS" || u === "STAND NUMBER" || u === "STAND" || u === "N/A";
}

export function parseSheetLedgerRows(values: string[][], sheetTab: string): LedgerAmounts[] {
  if (!values.length) return [];
  const idx = buildLedgerHeaderIndex(values[0] || []);
  const standIdx = idx.stand >= 0 ? idx.stand : 1;
  const out: LedgerAmounts[] = [];
  const seen = new Set<string>();

  for (let r = 1; r < values.length; r++) {
    const row = values[r] || [];
    const standNumber = (row[standIdx] || "").toString().trim().toUpperCase();
    if (isJunkStand(standNumber) || seen.has(standNumber)) continue;

    const first = idx.firstName >= 0 ? (row[idx.firstName] || "").toString().trim() : "";
    const last = idx.lastName >= 0 ? (row[idx.lastName] || "").toString().trim() : "";
    const full = idx.fullName >= 0 ? (row[idx.fullName] || "").toString().trim() : "";
    const email = idx.email >= 0 ? (row[idx.email] || "").toString().trim() : "";
    const customerName = (`${first} ${last}`.trim() || full).trim();
    const totalPrice = parseMoney(idx.totalPrice >= 0 ? row[idx.totalPrice] : 0);
    const deposit = parseMoney(idx.deposit >= 0 ? row[idx.deposit] : 0);
    let totalPaid = parseMoney(idx.totalPaid >= 0 ? row[idx.totalPaid] : 0);
    let currentBalance = parseMoney(idx.currentBalance >= 0 ? row[idx.currentBalance] : 0);

    if (idx.currentBalance < 0 && idx.totalPrice >= 0 && (idx.totalPaid >= 0 || deposit)) {
      currentBalance = round2(totalPrice - totalPaid);
    } else if (idx.totalPaid < 0 && idx.totalPrice >= 0 && idx.currentBalance >= 0) {
      totalPaid = round2(totalPrice - currentBalance);
    }

    const empty = !customerName && !email && totalPaid === 0 && currentBalance === 0 && totalPrice === 0;
    if (empty) continue;

    seen.add(standNumber);
    out.push({
      standNumber,
      customerName,
      email,
      totalPrice,
      deposit,
      totalPaid,
      currentBalance,
      sheetTab,
    });
  }
  return out;
}
