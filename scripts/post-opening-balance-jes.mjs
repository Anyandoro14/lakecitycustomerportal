#!/usr/bin/env node
/**
 * Post Lake City opening-balance stand sales journal entries as of 2026-01-01.
 *
 * Balance source of truth (always):
 *   Google Collection Schedule
 *   https://docs.google.com/spreadsheets/d/1yAHOC73ufVsSdv0rN8iTgfdVrMAjt8aD_MnaToE9du0/edit?gid=415963215
 *   Tabs: gid=415963215 (36mo), gid=577522818 (48mo)
 *   Fields: TOTAL PRICE, TOTAL PAID, Current Balance / Accounts Receivable, Contract Liabilities, VAT
 *
 * Local workbook is only an offline export of that sheet:
 *   COLLECTION SCHEDULE - JE for [OPENING BALANCES] (1).xlsx
 *
 * Odoo `lakecity_loan_management` is NOT the balance SoT. It receives sheet amounts for GL
 * posting and holds the payment schedule + payment amounts used for arrears / prepayments.
 *
 * Walkthrough (dated CUTOFF_DATE for every customer):
 *   JE1 — Dr AR (121000) / Cr Contract Liabilities (212010) / Cr Deferred Output VAT (251020)
 *   Then for pre-cutoff sheet TOTAL PAID > 0:
 *     Receipt Dr Bank / Cr AR; Revenue/VAT release Dr CL + Deferred VAT / Cr Revenue + VAT Output
 *
 * Usage:
 *   node scripts/post-opening-balance-jes.mjs --parse-only
 *   node --env-file=.env scripts/post-opening-balance-jes.mjs --dry-run
 *   node --env-file=.env scripts/post-opening-balance-jes.mjs --force
 *   node --env-file=.env scripts/post-opening-balance-jes.mjs --stand 3072 --force
 *
 * Env: ODOO_ORIGIN, LAKECITY_LOAN_API_TOKEN
 * Preferred: GOOGLE_SERVICE_ACCOUNT_KEY, SPREADSHEET_ID (or OPENING_BALANCE_SPREADSHEET_ID)
 */

import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const VAT_RATE = 0.155;
const CUTOFF_DATE = "2026-01-01";
const SPREADSHEET_ID_DEFAULT = "1yAHOC73ufVsSdv0rN8iTgfdVrMAjt8aD_MnaToE9du0";
/** Live Collection Schedule tabs (user-provided gids). */
const SHEET_GIDS = ["415963215", "577522818"];

const argv = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const dryRun = argv.has("--dry-run");
const parseOnly = argv.has("--parse-only");
const force = argv.has("--force") || process.env.OPENING_BALANCE_FORCE === "1";

function positionalArgs() {
  const raw = process.argv.slice(2);
  const skip = new Set();
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === "--stand" || a === "--sheet" || a === "--cutoff") {
      if (raw[i + 1] && !raw[i + 1].startsWith("--")) skip.add(i + 1);
    }
  }
  return raw.filter((a, i) => !a.startsWith("--") && !skip.has(i));
}

const standFilter = (() => {
  const idx = process.argv.indexOf("--stand");
  return idx >= 0 ? String(process.argv[idx + 1] || "").trim() : "";
})();

const cutoffDate = (() => {
  const idx = process.argv.indexOf("--cutoff");
  return idx >= 0 ? String(process.argv[idx + 1] || "").trim() : CUTOFF_DATE;
})();

const DEFAULT_SOURCE = path.join(
  process.cwd(),
  "COLLECTION SCHEDULE - JE for [OPENING BALANCES] (1).xlsx",
);

function resolveSourcePath() {
  if (process.env.OPENING_BALANCE_XLSX) return process.env.OPENING_BALANCE_XLSX;
  for (const arg of positionalArgs()) {
    if (/\.xlsx?$/i.test(arg) || fs.existsSync(arg)) return arg;
  }
  return DEFAULT_SOURCE;
}

const sourcePath = resolveSourcePath();
const OPENING_BALANCE_ROUTE = "/lakecity/api/v1/loan/opening-balance/post";

const odooOrigin = (process.env.ODOO_ORIGIN || "").replace(/\/$/, "");
const apiToken = process.env.LAKECITY_LOAN_API_TOKEN || "";
const odooHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiToken}`,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseMoney(val) {
  if (val == null) return 0;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const s = String(val).trim();
  if (!s) return 0;
  const cleaned = s.replace(/[$£€,\s]/g, "").replace(/^\(/, "-").replace(/\)$/, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normStand(raw) {
  const s = String(raw ?? "").trim().replace(/^#/, "");
  if (!s) return "";
  const n = Number.parseFloat(s);
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return s.toUpperCase();
}

function excelDateToISO(raw) {
  if (raw == null) return cutoffDate;
  if (raw instanceof Date && !Number.isNaN(+raw)) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + raw * 86400000).toISOString().slice(0, 10);
  }
  const t = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  return Number.isNaN(+d) ? cutoffDate : d.toISOString().slice(0, 10);
}

function parseMonthHeader(header) {
  const t = String(header ?? "").trim();
  // "5 January 2025" or Excel date
  if (header instanceof Date && !Number.isNaN(+header)) {
    return new Date(Date.UTC(header.getFullYear(), header.getMonth(), 1));
  }
  if (typeof header === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + header * 86400000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }
  const m = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const d = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
    if (!Number.isNaN(+d)) return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(t.slice(0, 10));
    if (!Number.isNaN(+d)) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }
  return null;
}

function contractSplits(totalPrice, colO, colP, isExclusive) {
  const gross = totalPrice;
  if (isExclusive) {
    return {
      gross,
      contractLiability: colO > 0 ? colO : Math.round(gross * (1 - VAT_RATE) * 100) / 100,
      deferredVat: colP > 0 ? colP : Math.round(gross * VAT_RATE * 100) / 100,
    };
  }
  const deferredVat = colP > 0 ? colP : Math.round((gross - gross / (1 + VAT_RATE)) * 100) / 100;
  const contractLiability =
    colO + colP > 0 ? colO + colP : Math.round((gross / (1 + VAT_RATE)) * 100) / 100;
  return { gross, contractLiability, deferredVat };
}

function headerIndex(header, name) {
  return header.findIndex((h) => String(h ?? "").trim().toLowerCase() === name.toLowerCase());
}

/** Parse Collection Schedule matrix rows into balance SoT stand records (sheet columns only). */
function parseScheduleMatrix(matrix, sheetName) {
  if (!matrix?.length) return [];
  const header = matrix[0].map((h) => String(h ?? "").trim());
  const standIdx = headerIndex(header, "Stand Number");
  const arIdx = headerIndex(header, "Accounts Receivable");
  const balIdx = headerIndex(header, "Current Balance");
  const clIdx = header.findIndex((h) => h.toLowerCase().startsWith("contract liabilities"));
  const vatIdx = headerIndex(header, "VAT");
  const tpIdx = headerIndex(header, "TOTAL PRICE");
  const paidIdx = headerIndex(header, "TOTAL PAID");
  const depIdx = headerIndex(header, "Deposit");
  const vatTypeIdx = headerIndex(header, "Agreement Type (VAT)");
  const startIdx = headerIndex(header, "START DATE");
  const fnIdx = headerIndex(header, "First Name");
  const lnIdx = headerIndex(header, "Last Name");
  const emailIdx = headerIndex(header, "Email");
  const phoneIdx = header.findIndex((h) => /contact number/i.test(h));
  const payIdx = headerIndex(header, "PAYMENT");
  const termIdx = headerIndex(header, "NUMBER OF INSTALLMENTS");

  if (standIdx < 0 || tpIdx < 0) {
    console.warn(`Skip sheet ${sheetName}: missing Stand Number / TOTAL PRICE`);
    return [];
  }

  const out = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const stand = normStand(row[standIdx]);
    if (!stand) continue;
    if (/^TOTAL/i.test(stand) || /^TOTAL/i.test(String(row[fnIdx] ?? ""))) continue;
    // Skip known sandbox / test stands
    if (/^(777777|999999|5555577)$/.test(stand)) continue;
    if (standFilter && stand !== normStand(standFilter)) continue;

    const totalPrice = parseMoney(row[tpIdx]);
    if (totalPrice <= 0) continue;

    const totalPaid = parseMoney(paidIdx >= 0 ? row[paidIdx] : 0);
    let arTarget = 0;
    if (arIdx >= 0 && parseMoney(row[arIdx]) > 0) arTarget = parseMoney(row[arIdx]);
    else if (balIdx >= 0) arTarget = parseMoney(row[balIdx]);
    else arTarget = Math.round((totalPrice - totalPaid) * 100) / 100;

    const colO = clIdx >= 0 ? parseMoney(row[clIdx]) : 0;
    const colP = vatIdx >= 0 ? parseMoney(row[vatIdx]) : 0;
    const vatType = String(vatTypeIdx >= 0 ? row[vatTypeIdx] ?? "" : "");
    const isExclusive = /exclusive/i.test(vatType);
    const splits = contractSplits(totalPrice, colO, colP, isExclusive);
    const first = fnIdx >= 0 ? String(row[fnIdx] ?? "").trim() : "";
    const last = lnIdx >= 0 ? String(row[lnIdx] ?? "").trim() : "";
    const name = [first, last].filter(Boolean).join(" ").trim() || `Stand ${stand}`;

    out.push({
      stand,
      name,
      email: emailIdx >= 0 ? String(row[emailIdx] ?? "").trim() : "",
      phone: phoneIdx >= 0 ? String(row[phoneIdx] ?? "").trim() : "",
      totalPrice,
      totalPaid,
      deposit: depIdx >= 0 ? parseMoney(row[depIdx]) : 0,
      monthlyPayment: payIdx >= 0 ? parseMoney(row[payIdx]) : 0,
      termMonths: termIdx >= 0 ? Math.round(parseMoney(row[termIdx])) || 36 : 36,
      arTarget: Math.max(0, arTarget),
      colO,
      colP,
      vatType,
      isExclusive,
      ...splits,
      paymentStart: startIdx >= 0 ? excelDateToISO(row[startIdx]) : cutoffDate,
      impliedAr: Math.round((splits.gross - totalPaid) * 100) / 100,
      externalUid: `collection-csv-${stand}`,
      sourceSheet: sheetName,
      balanceSource: "collection-schedule",
      hasJeColumns: arIdx >= 0 && clIdx >= 0 && vatIdx >= 0,
    });
  }
  return out;
}

function loadJeSheet(wb, sheetName) {
  if (!wb.Sheets[sheetName]) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null, raw: true });
  return parseScheduleMatrix(rows, sheetName);
}

function loadGridSheetPreCutoffPaid(wb, sheetName) {
  if (!wb.Sheets[sheetName]) return new Map();
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null, raw: true });
  if (!rows.length) return new Map();
  const header = rows[0];
  const standIdx = header.findIndex((h) => String(h ?? "").toLowerCase().includes("stand number"));
  if (standIdx < 0) return new Map();

  const cutoff = new Date(`${cutoffDate}T00:00:00Z`);
  const monthIdxs = [];
  for (let i = 0; i < header.length; i++) {
    const month = parseMonthHeader(header[i]);
    if (month && month < cutoff) monthIdxs.push(i);
  }

  const paidByStand = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const stand = normStand(row[standIdx]);
    if (!stand) continue;
    let paid = 0;
    for (const i of monthIdxs) paid += parseMoney(row[i]);
    paidByStand.set(stand, Math.round(paid * 100) / 100);
  }
  console.log(
    `Sheet ${sheetName}: ${monthIdxs.length} month column(s) before ${cutoffDate}; ${paidByStand.size} stand(s)`,
  );
  return paidByStand;
}

function loadRowsFromWorkbook() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Workbook not found: ${sourcePath}`);
  }
  const wb = XLSX.read(fs.readFileSync(sourcePath), { type: "buffer", cellDates: true });

  /** Prefer dedicated JE sheet, then merge other schedule tabs. */
  const preferred = [
    "Collection Schedule - 36mo",
    "Collection Schedule - 48mo",
    "Collection Schedule - 120mo",
  ];
  const byStand = new Map();

  for (const name of preferred) {
    if (!wb.SheetNames.includes(name)) continue;
    for (const row of loadJeSheet(wb, name)) {
      const prev = byStand.get(row.stand);
      if (!prev || (row.hasJeColumns && !prev.hasJeColumns)) {
        byStand.set(row.stand, row);
      }
    }
  }

  // Override TOTAL PAID with pre-cutoff month-grid sums when JE sheet paid looks stale / missing
  for (const name of preferred) {
    if (!wb.SheetNames.includes(name)) continue;
    const gridPaid = loadGridSheetPreCutoffPaid(wb, name);
    for (const [stand, paid] of gridPaid) {
      const row = byStand.get(stand);
      if (!row) continue;
      if (!row.hasJeColumns || row.totalPaid <= 0) {
        row.totalPaid = paid;
        row.arTarget = Math.max(0, Math.round((row.totalPrice - paid) * 100) / 100);
        row.impliedAr = row.arTarget;
      }
    }
  }

  return [...byStand.values()].sort((a, b) => a.stand.localeCompare(b.stand, undefined, { numeric: true }));
}

// ── Google Sheets (balance source of truth) ──────────────────────────────

function base64url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getGoogleAccessToken() {
  const keyString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "";
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || "";
  if (!keyString) return null;

  let privateKeyPem;
  let serviceAccountEmail;
  try {
    const credentials = JSON.parse(keyString.replace(/\\n/g, "\n"));
    privateKeyPem = credentials.private_key;
    serviceAccountEmail = credentials.client_email;
  } catch {
    privateKeyPem = keyString;
    serviceAccountEmail = clientEmail;
  }
  if (!privateKeyPem || !serviceAccountEmail) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const jwtHeader = base64url(JSON.stringify(header));
  const jwtClaimSet = base64url(JSON.stringify(claimSet));
  const { createSign } = await import("node:crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(`${jwtHeader}.${jwtClaimSet}`);
  signer.end();
  const sig = signer.sign(privateKeyPem, "base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${jwtHeader}.${jwtClaimSet}.${sig}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenResponse.ok) {
    console.warn("Google token exchange failed:", await tokenResponse.text());
    return null;
  }
  const { access_token } = await tokenResponse.json();
  return access_token;
}

/**
 * Load balance SoT rows from live Collection Schedule tabs (gids).
 * Returns { rows, preCutoffPaidByStand } — never uses Odoo for amounts.
 */
async function fetchGoogleCollectionSchedule() {
  const spreadsheetId =
    process.env.OPENING_BALANCE_SPREADSHEET_ID ||
    process.env.SPREADSHEET_ID ||
    SPREADSHEET_ID_DEFAULT;
  const token = await getGoogleAccessToken();
  if (!token) {
    console.log(
      "No Google credentials — falling back to local workbook export of Collection Schedule (not Odoo).",
    );
    return { rows: [], preCutoffPaidByStand: new Map() };
  }

  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) {
    console.warn("Could not load Google spreadsheet metadata:", await metaRes.text());
    return { rows: [], preCutoffPaidByStand: new Map() };
  }
  const meta = await metaRes.json();
  const sheets = meta.sheets || [];
  const titles = [];
  for (const gid of SHEET_GIDS) {
    const sheet = sheets.find((s) => String(s.properties.sheetId) === String(gid));
    if (sheet) titles.push(sheet.properties.title);
    else console.warn(`Sheet gid=${gid} not found in spreadsheet`);
  }
  if (!titles.length) return { rows: [], preCutoffPaidByStand: new Map() };

  const byStand = new Map();
  const paidByStand = new Map();
  const cutoff = new Date(`${cutoffDate}T00:00:00Z`);

  for (const title of titles) {
    const range = encodeURIComponent(`${title}!A:ZZ`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.warn(`Failed to read tab ${title}`);
      continue;
    }
    const data = await res.json();
    const matrix = data.values || [];
    if (matrix.length < 2) continue;

    const parsed = parseScheduleMatrix(matrix, title);
    for (const row of parsed) {
      row.balanceSource = "google-sheets";
      const prev = byStand.get(row.stand);
      if (!prev || (row.hasJeColumns && !prev.hasJeColumns)) {
        byStand.set(row.stand, row);
      }
    }
    console.log(`Google tab "${title}": ${parsed.length} stand balance row(s)`);

    const header = matrix[0];
    const standIdx = header.findIndex((h) => String(h ?? "").toLowerCase().includes("stand number"));
    if (standIdx < 0) continue;

    // Month-grid fill-in only when sheet TOTAL PAID is empty (schedule cells are still sheet SoT)
    const monthIdxs = [];
    for (let i = 0; i < header.length; i++) {
      const month = parseMonthHeader(header[i]);
      if (month && month < cutoff) monthIdxs.push(i);
    }
    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i];
      const stand = normStand(row[standIdx]);
      if (!stand) continue;
      let paid = 0;
      for (const mi of monthIdxs) paid += parseMoney(row[mi]);
      if (paid > 0) {
        const prev = paidByStand.get(stand) || 0;
        paidByStand.set(stand, Math.max(prev, Math.round(paid * 100) / 100));
      }
    }
    console.log(`Google tab "${title}": ${monthIdxs.length} pre-cutoff month column(s)`);
  }

  return {
    rows: [...byStand.values()].sort((a, b) => a.stand.localeCompare(b.stand, undefined, { numeric: true })),
    preCutoffPaidByStand: paidByStand,
  };
}

async function odooPost(route, body) {
  if (parseOnly) return { ok: true };
  const url = `${odooOrigin}${route}`;
  if (dryRun) {
    console.log(`[DRY] POST ${route}`, JSON.stringify(body).slice(0, 280));
    return { ok: true };
  }
  const res = await fetch(url, { method: "POST", headers: odooHeaders, body: JSON.stringify(body) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    if (res.status === 404 && route === OPENING_BALANCE_ROUTE) {
      throw new Error(
        "HTTP 404 — opening-balance API not deployed. Upgrade lakecity_loan_management ≥ 19.0.1.0.54 on Odoo.sh, then retry.",
      );
    }
    throw new Error(`HTTP ${res.status} ${route}: ${text.slice(0, 400)}`);
  }
  if (!res.ok || json?.ok === false) {
    throw new Error(`HTTP ${res.status} ${route}: ${json?.error || text.slice(0, 400)}`);
  }
  return json;
}

async function assertOpeningBalanceApiReady() {
  if (parseOnly || dryRun) return;
  const res = await fetch(`${odooOrigin}${OPENING_BALANCE_ROUTE}`, {
    method: "POST",
    headers: odooHeaders,
    body: JSON.stringify({}),
  });
  const text = await res.text();
  if (res.status === 404 || (text.startsWith("<!") && text.includes("<html"))) {
    console.error(
      [
        "",
        "The opening-balance API is not available on this Odoo instance (HTTP 404).",
        "Deploy and upgrade lakecity_loan_management version 19.0.1.0.54+ first, then re-run with --force.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
}

async function main() {
  console.log(`Cutover date (all opening JEs): ${cutoffDate}`);
  console.log(`Force repost: ${force ? "yes" : "no"}`);
  console.log(
    "Balance SoT: Google Collection Schedule (gid=415963215 / 577522818). Odoo loan module is not used for balances.",
  );

  const google = await fetchGoogleCollectionSchedule();
  let rows = google.rows;
  if (rows.length) {
    console.log(`Loaded ${rows.length} stand(s) from Google Collection Schedule (balance SoT)`);
  } else {
    rows = loadRowsFromWorkbook();
    console.log(
      `Loaded ${rows.length} stand(s) from local workbook export ${path.basename(sourcePath)} (offline sheet copy)`,
    );
  }

  // Fill TOTAL PAID from sheet month grid only when the TOTAL PAID column is empty
  const gridPaid = google.preCutoffPaidByStand;
  if (gridPaid.size) {
    let applied = 0;
    for (const row of rows) {
      if (row.totalPaid > 0) continue;
      if (!gridPaid.has(row.stand)) continue;
      row.totalPaid = gridPaid.get(row.stand);
      row.arTarget = Math.max(0, Math.round((row.totalPrice - row.totalPaid) * 100) / 100);
      row.impliedAr = row.arTarget;
      row.paidSource = "sheet-month-grid";
      applied++;
    }
    if (applied) console.log(`Filled empty TOTAL PAID from sheet month grid for ${applied} stand(s)`);
  }

  if (standFilter) console.log(`Filter: stand ${standFilter}`);
  const withPreCutoffPaid = rows.filter((r) => r.totalPaid > 0).length;
  console.log(`Stands with sheet pre-cutoff / TOTAL PAID > 0: ${withPreCutoffPaid}`);

  if (!parseOnly && !dryRun && (!odooOrigin || !apiToken)) {
    console.error("Set ODOO_ORIGIN and LAKECITY_LOAN_API_TOKEN (or use --parse-only / --dry-run)");
    process.exit(1);
  }

  await assertOpeningBalanceApiReady();

  let ok = 0;
  let skipped = 0;
  let failures = 0;

  for (const row of rows) {
    // Sheet amounts only — never prefer Odoo contract.total_price / deposit / balance.
    const termMonths = row.termMonths || 36;
    const totalPrice = row.totalPrice;
    const deposit = row.deposit;
    // Sheet TOTAL PRICE = receivable gross (CL + VAT). Always treat as VAT-inclusive in Odoo
    // so total_with_tax == TOTAL PRICE and AR = sheet Current Balance / TOTAL PRICE − TOTAL PAID.
    const isVatInclusive = true;

    try {
      const splits = contractSplits(totalPrice, row.colO, row.colP, row.isExclusive);
      const arTarget =
        row.arTarget > 0
          ? row.arTarget
          : Math.max(0, Math.round((splits.gross - row.totalPaid) * 100) / 100);

      if (arTarget <= 0 && row.totalPaid <= 0) {
        skipped++;
        console.log(`SKIP stand ${row.stand}: no AR and no sheet payments`);
        continue;
      }

      const loanBody = {
        external_uid: row.externalUid,
        stand_number: row.stand,
        partner: {
          email: row.email || undefined,
          name: row.name,
          phone: row.phone || undefined,
        },
        term_months: termMonths,
        due_day: 5,
        payment_start_date: row.paymentStart,
        total_price: totalPrice,
        deposit_amount: deposit,
        tax_rate: 15.5,
        is_vat_inclusive: isVatInclusive,
        agreement_signed_seller: true,
        agreement_signed_buyer: true,
        state: "active",
        // Schedule in Odoo is for arrears/prepayments; balance figures come from the sheet payload.
        generate_schedule: true,
        activate: false,
        create_crm_lead_first: false,
      };

      if (!parseOnly) {
        await odooPost(OPENING_BALANCE_ROUTE, {
          stand_number: row.stand,
          external_uid: row.externalUid,
          accounts_receivable: arTarget,
          contract_liability: splits.contractLiability,
          deferred_vat: splits.deferredVat,
          total_paid: row.totalPaid,
          total_price: totalPrice,
          is_vat_inclusive: isVatInclusive,
          payment_date: cutoffDate,
          force,
          loan: loanBody,
        });
      }

      ok++;
      const src = row.paidSource || row.balanceSource || "collection-schedule";
      console.log(
        `OK  stand ${row.stand} ${row.name}: JE1 @ ${cutoffDate} gross ${splits.gross.toFixed(2)} | CL ${splits.contractLiability.toFixed(2)} | Def VAT ${splits.deferredVat.toFixed(2)} | sheet paid ${row.totalPaid.toFixed(2)} | sheet AR ${arTarget.toFixed(2)} [${src}]`,
      );
    } catch (e) {
      failures++;
      console.error(`FAIL stand ${row.stand}:`, e.message);
    }
    await sleep(parseOnly ? 0 : 80);
  }

  console.log(`\nDone: ${ok} processed, ${skipped} skipped, ${failures} failures (cutover ${cutoffDate})`);
  if (dryRun || parseOnly) console.log("(no HTTP mutations sent)");
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
