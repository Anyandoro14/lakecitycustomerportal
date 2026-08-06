#!/usr/bin/env node
/**
 * Post Lake City opening-balance stand sales journal entries as of 2026-01-01.
 *
 * Balance source of truth (always — live Google Sheet only, no local xlsx):
 *   https://docs.google.com/spreadsheets/d/1yAHOC73ufVsSdv0rN8iTgfdVrMAjt8aD_MnaToE9du0/edit?gid=415963215
 *   Tabs: gid=415963215 (36mo), gid=577522818 (48mo)
 *   Fields: TOTAL PRICE, TOTAL PAID, Current Balance / Accounts Receivable, Contract Liabilities, VAT
 *
 * Odoo `lakecity_loan_management` is NOT the balance SoT. It receives sheet amounts for GL
 * posting and holds the payment schedule + payment amounts used for arrears / prepayments.
 *
 * Walkthrough (dated CUTOFF_DATE for every customer that already has an Odoo contract):
 *   JE1 — Dr AR / Cr Contract Liabilities / Cr Deferred Output VAT for sheet TOTAL PRICE
 *   Then for pre-2026 receipts (sum of month columns dated before cutover):
 *     Receipt Dr Bank / Cr AR; Revenue/VAT release Dr CL + Deferred VAT / Cr Revenue + VAT Output
 *
 * Does NOT create missing contracts — skips stands with no existing Odoo loan.
 * Opening paid = sum of live sheet month cells before cutover (not live TOTAL PAID, which includes 2026+).
 * Force clear (module ≥ 19.0.1.0.66) removes only pre-cutover receipts; keep 2026+ and
 * re-import them with: node --env-file=.env scripts/import-post-cutoff-sheet-payments.mjs
 *
 * Usage:
 *   node --env-file=.env scripts/post-opening-balance-jes.mjs --parse-only
 *   node --env-file=.env scripts/post-opening-balance-jes.mjs --dry-run
 *   node --env-file=.env scripts/post-opening-balance-jes.mjs --force
 *   node --env-file=.env scripts/post-opening-balance-jes.mjs --stand 3072 --force
 *
 * Env (required for sheet read):
 *   GOOGLE_SERVICE_ACCOUNT_KEY — service-account JSON string (or path via GOOGLE_APPLICATION_CREDENTIALS)
 *   GOOGLE_CLIENT_EMAIL — only if KEY is a raw PEM instead of JSON
 *   SPREADSHEET_ID or OPENING_BALANCE_SPREADSHEET_ID — optional; defaults to the Collection Schedule id
 * Env (required to post): ODOO_ORIGIN, LAKECITY_LOAN_API_TOKEN
 */

import fs from "node:fs";

const VAT_RATE = 0.155;
const CUTOFF_DATE = "2026-01-01";
const SPREADSHEET_ID_DEFAULT = "1yAHOC73ufVsSdv0rN8iTgfdVrMAjt8aD_MnaToE9du0";
/** Live Collection Schedule tabs (user-provided gids). */
const SHEET_GIDS = ["415963215", "577522818"];

const argv = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const dryRun = argv.has("--dry-run");
const parseOnly = argv.has("--parse-only");
const force = argv.has("--force") || process.env.OPENING_BALANCE_FORCE === "1";

const standFilter = (() => {
  const idx = process.argv.indexOf("--stand");
  return idx >= 0 ? String(process.argv[idx + 1] || "").trim() : "";
})();

const cutoffDate = (() => {
  const idx = process.argv.indexOf("--cutoff");
  return idx >= 0 ? String(process.argv[idx + 1] || "").trim() : CUTOFF_DATE;
})();

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
  const gross = Math.round((totalPrice || 0) * 100) / 100;
  let deferredVat;
  let contractLiability;
  if (isExclusive) {
    deferredVat = colP > 0 ? colP : Math.round(gross * VAT_RATE * 100) / 100;
    contractLiability = colO > 0 ? colO : Math.round((gross - deferredVat) * 100) / 100;
  } else {
    // Inclusive: colO = net contract liability, colP = deferred VAT (do not add O+P into CL).
    deferredVat = colP > 0 ? colP : Math.round((gross - gross / (1 + VAT_RATE)) * 100) / 100;
    contractLiability = colO > 0 ? colO : Math.round((gross - deferredVat) * 100) / 100;
  }
  deferredVat = Math.round(deferredVat * 100) / 100;
  contractLiability = Math.round(contractLiability * 100) / 100;
  // JE1 must balance: Dr AR (gross) = Cr CL + Cr deferred VAT (fix sheet 1¢ drift).
  const credit = Math.round((contractLiability + deferredVat) * 100) / 100;
  if (credit !== gross) {
    contractLiability = Math.round((gross - deferredVat) * 100) / 100;
  }
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
      balanceSource: "google-sheets",
      hasJeColumns: arIdx >= 0 && clIdx >= 0 && vatIdx >= 0,
    });
  }
  return out;
}

function base64url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function loadGoogleServiceAccountCredentials() {
  const clientEmailEnv = process.env.GOOGLE_CLIENT_EMAIL || "";
  let keyString = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").trim();
  const credPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();

  if (!keyString && credPath) {
    if (!fs.existsSync(credPath)) {
      throw new Error(`GOOGLE_APPLICATION_CREDENTIALS file not found: ${credPath}`);
    }
    keyString = fs.readFileSync(credPath, "utf8").trim();
  }

  if (!keyString) {
    throw new Error(
      [
        "Live Google Sheet credentials are required (local xlsx is not used).",
        "Set GOOGLE_SERVICE_ACCOUNT_KEY to the service-account JSON (same secret as Supabase Edge Functions),",
        "or set GOOGLE_APPLICATION_CREDENTIALS to a JSON key file path.",
        "Share the spreadsheet with the service account client_email as Viewer.",
      ].join(" "),
    );
  }

  if (!keyString.startsWith("{") && fs.existsSync(keyString)) {
    keyString = fs.readFileSync(keyString, "utf8").trim();
  }

  try {
    // Env-var JSON is often one line with "\\n" escapes; file JSON is already valid as-is.
    let credentials;
    try {
      credentials = JSON.parse(keyString);
    } catch {
      credentials = JSON.parse(keyString.replace(/\\n/g, "\n"));
    }
    if (!credentials.private_key || !credentials.client_email) {
      throw new Error("JSON missing private_key or client_email");
    }
    return {
      privateKeyPem: credentials.private_key,
      serviceAccountEmail: credentials.client_email,
    };
  } catch (e) {
    if (!clientEmailEnv) {
      throw new Error(
        `GOOGLE_SERVICE_ACCOUNT_KEY must be service-account JSON (or set GOOGLE_CLIENT_EMAIL with a PEM key): ${e.message}`,
      );
    }
    return { privateKeyPem: keyString, serviceAccountEmail: clientEmailEnv };
  }
}

async function getGoogleAccessToken() {
  const { privateKeyPem, serviceAccountEmail } = loadGoogleServiceAccountCredentials();

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
    throw new Error(`Google token exchange failed: ${await tokenResponse.text()}`);
  }
  const { access_token } = await tokenResponse.json();
  if (!access_token) throw new Error("Google token exchange returned no access_token");
  return access_token;
}

/**
 * Load balance SoT rows from live Collection Schedule tabs (gids).
 * Never reads a local workbook and never uses Odoo for amounts.
 */
async function fetchGoogleCollectionSchedule() {
  const spreadsheetId =
    process.env.OPENING_BALANCE_SPREADSHEET_ID ||
    process.env.SPREADSHEET_ID ||
    SPREADSHEET_ID_DEFAULT;
  const token = await getGoogleAccessToken();

  console.log(`Reading live Google Sheet ${spreadsheetId} (gids ${SHEET_GIDS.join(", ")})`);

  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) {
    throw new Error(`Could not load Google spreadsheet metadata: ${await metaRes.text()}`);
  }
  const meta = await metaRes.json();
  const sheets = meta.sheets || [];
  const titles = [];
  for (const gid of SHEET_GIDS) {
    const sheet = sheets.find((s) => String(s.properties.sheetId) === String(gid));
    if (sheet) titles.push(sheet.properties.title);
    else console.warn(`Sheet gid=${gid} not found in spreadsheet`);
  }
  if (!titles.length) {
    throw new Error(
      `No Collection Schedule tabs found for gids ${SHEET_GIDS.join(", ")} in spreadsheet ${spreadsheetId}`,
    );
  }

  const byStand = new Map();
  const paidByStand = new Map();
  const cutoff = new Date(`${cutoffDate}T00:00:00Z`);

  for (const title of titles) {
    const range = encodeURIComponent(`${title}!A:ZZ`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Failed to read live Google tab "${title}": ${await res.text()}`);
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

  const rows = [...byStand.values()].sort((a, b) =>
    a.stand.localeCompare(b.stand, undefined, { numeric: true }),
  );
  if (!rows.length) {
    throw new Error(
      `Live Google Sheet ${spreadsheetId} returned 0 stand rows from tabs: ${titles.join(", ")}`,
    );
  }

  return { rows, preCutoffPaidByStand: paidByStand, spreadsheetId, titles };
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
    const err = String(json?.error || text.slice(0, 400));
    // Odoo ≤19.0.1.0.64: work commits, then response fails on Date.to_string(str).
    // Treat as success so --force can finish the cutover; upgrade to .65 for a clean API.
    if (route === OPENING_BALANCE_ROUTE && /strftime/i.test(err)) {
      return { ok: true, soft_strftime_bug: true, error: err };
    }
    throw new Error(`HTTP ${res.status} ${route}: ${err}`);
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

async function odooGetContract(stand) {
  if (parseOnly) return { ok: true, contract: { stand_number: stand } };
  const res = await fetch(
    `${odooOrigin}/lakecity/api/v1/loan/get?stand_number=${encodeURIComponent(stand)}`,
    { headers: odooHeaders },
  );
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: `HTTP ${res.status} non-JSON` };
  }
  if (!res.ok || json?.ok === false) return { ok: false, error: json?.error || `HTTP ${res.status}` };
  return { ok: true, contract: json.contract || null };
}

async function main() {
  console.log(`Cutover date (all opening JEs): ${cutoffDate}`);
  console.log(`Force repost: ${force ? "yes" : "no"}`);
  console.log(
    "Live Google Sheet SoT for TOTAL PRICE + pre-2026 paid. Existing Odoo contracts only — will not create missing contracts.",
  );

  const google = await fetchGoogleCollectionSchedule();
  const rows = google.rows;
  console.log(
    `Loaded ${rows.length} stand(s) from live Google Sheet ${google.spreadsheetId} [${google.titles.join(", ")}]`,
  );

  // Opening paid = sum(month columns before cutover) on the live sheet.
  // Do not add Deposit separately: on this workbook TOTAL PAID tracks month cells (deposit is often
  // already embedded in an early month amount). Do not use live TOTAL PAID (includes 2026+).
  const gridPaid = google.preCutoffPaidByStand;
  let withPreCutoff = 0;
  for (const row of rows) {
    const monthsPre = gridPaid.get(row.stand) || 0;
    const openingPaid = Math.round(monthsPre * 100) / 100;
    row.openingPaid = openingPaid;
    row.monthsPreCutoff = monthsPre;
    row.arAtCutover = Math.max(0, Math.round((row.totalPrice - openingPaid) * 100) / 100);
    row.paidSource = "pre-2026-month-grid";
    if (openingPaid > 0) withPreCutoff++;
  }
  console.log(`Stands with pre-${cutoffDate} opening paid > 0: ${withPreCutoff}`);

  if (standFilter) console.log(`Filter: stand ${standFilter}`);

  if (!parseOnly && !dryRun && (!odooOrigin || !apiToken)) {
    console.error("Set ODOO_ORIGIN and LAKECITY_LOAN_API_TOKEN (or use --parse-only / --dry-run)");
    process.exit(1);
  }

  await assertOpeningBalanceApiReady();

  let ok = 0;
  let skipped = 0;
  let skippedNoContract = 0;
  let failures = 0;

  for (const row of rows) {
    const totalPrice = row.totalPrice;
    const isVatInclusive = true;
    const openingPaid = row.openingPaid || 0;
    const arAtCutover = row.arAtCutover;

    try {
      const existing = await odooGetContract(row.stand);
      if (!existing.ok || !existing.contract) {
        skippedNoContract++;
        console.log(
          `SKIP stand ${row.stand} ${row.name}: no existing Odoo contract (not creating)`,
        );
        await sleep(parseOnly ? 0 : 40);
        continue;
      }

      const splits = contractSplits(totalPrice, row.colO, row.colP, row.isExclusive);

      if (arAtCutover <= 0 && openingPaid <= 0) {
        skipped++;
        console.log(`SKIP stand ${row.stand}: no cutover AR and no pre-2026 payments`);
        continue;
      }

      let result = null;
      if (!parseOnly) {
        // No `loan` payload — never create/upsert contracts; post JEs on the existing contract only.
        result = await odooPost(OPENING_BALANCE_ROUTE, {
          stand_number: row.stand,
          external_uid: row.externalUid,
          accounts_receivable: arAtCutover > 0 ? arAtCutover : 0.01,
          contract_liability: splits.contractLiability,
          deferred_vat: splits.deferredVat,
          total_paid: openingPaid,
          total_price: totalPrice,
          is_vat_inclusive: isVatInclusive,
          payment_date: cutoffDate,
          force,
        });
      }

      ok++;
      const ob = result?.opening_balance || {};
      const moveBits = [
        ob.initial_move_id ? `JE1#${ob.initial_move_id}` : null,
        Array.isArray(ob.payment_move_ids) && ob.payment_move_ids.length
          ? `receiptMoves=${ob.payment_move_ids.join(",")}`
          : null,
        ob.payments_cleared != null ? `cleared=${ob.payments_cleared}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      console.log(
        `OK  stand ${row.stand} ${row.name}: JE @ ${cutoffDate} gross ${splits.gross.toFixed(2)} | CL ${splits.contractLiability.toFixed(2)} | Def VAT ${splits.deferredVat.toFixed(2)} | pre-2026 paid ${openingPaid.toFixed(2)} | cutover AR ${arAtCutover.toFixed(2)}${moveBits ? ` | ${moveBits}` : ""}`,
      );
    } catch (e) {
      failures++;
      console.error(`FAIL stand ${row.stand}:`, e.message);
    }
    await sleep(parseOnly ? 0 : 80);
  }

  console.log(
    `\nDone: ${ok} processed, ${skipped} skipped, ${skippedNoContract} no-contract skipped, ${failures} failures (cutover ${cutoffDate})`,
  );
  if (dryRun || parseOnly) console.log("(no HTTP mutations sent)");
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
