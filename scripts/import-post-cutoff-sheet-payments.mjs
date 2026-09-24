#!/usr/bin/env node
/**
 * Import Collection Schedule month-grid receipts on/after cutover (default 2026-01-01)
 * into existing Odoo contracts via /lakecity/api/v1/payment/post.
 *
 * Use after opening-balance JEs are posted. Does not create contracts.
 * Pre-cutover cash stays as the lumped opening-balance-* receipt.
 *
 * Usage:
 *   node --env-file=.env scripts/import-post-cutoff-sheet-payments.mjs --dry-run
 *   node --env-file=.env scripts/import-post-cutoff-sheet-payments.mjs
 *   node --env-file=.env scripts/import-post-cutoff-sheet-payments.mjs --stand 3072
 *
 * Env: GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_SERVICE_ACCOUNT_KEY,
 *      ODOO_ORIGIN, LAKECITY_LOAN_API_TOKEN, SPREADSHEET_ID (optional)
 */

import fs from "node:fs";

const CUTOFF_DATE = "2026-01-01";
const SPREADSHEET_ID_DEFAULT = "1yAHOC73ufVsSdv0rN8iTgfdVrMAjt8aD_MnaToE9du0";
const SHEET_GIDS = ["415963215", "577522818"];

const dryRun = process.argv.includes("--dry-run");
const standFilter = (() => {
  const i = process.argv.indexOf("--stand");
  return i >= 0 ? String(process.argv[i + 1] || "").trim() : "";
})();
const cutoffDate = (() => {
  const i = process.argv.indexOf("--cutoff");
  return i >= 0 ? String(process.argv[i + 1] || "").trim() : CUTOFF_DATE;
})();

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
  const s = String(raw ?? "")
    .trim()
    .replace(/^#/, "");
  if (!s) return "";
  const n = Number.parseFloat(s);
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return s.toUpperCase();
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

function monthISO(d) {
  return d.toISOString().slice(0, 10);
}

function base64url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function loadGoogleCreds() {
  let keyString = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").trim();
  const credPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (!keyString && credPath) keyString = fs.readFileSync(credPath, "utf8").trim();
  if (!keyString) throw new Error("Missing Google credentials");
  if (!keyString.startsWith("{") && fs.existsSync(keyString)) {
    keyString = fs.readFileSync(keyString, "utf8").trim();
  }
  let credentials;
  try {
    credentials = JSON.parse(keyString);
  } catch {
    credentials = JSON.parse(keyString.replace(/\\n/g, "\n"));
  }
  return {
    privateKeyPem: credentials.private_key,
    serviceAccountEmail: credentials.client_email,
  };
}

async function getGoogleAccessToken() {
  const { privateKeyPem, serviceAccountEmail } = loadGoogleCreds();
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
  const sig = signer
    .sign(privateKeyPem, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const jwt = `${jwtHeader}.${jwtClaimSet}.${sig}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenResponse.ok) throw new Error(`Google token failed: ${await tokenResponse.text()}`);
  const { access_token } = await tokenResponse.json();
  return access_token;
}

/** @returns {Promise<Map<string, {stand:string, cells: {dateISO:string, amount:number, col:number, sheet:string}[]}>>} */
async function loadPostCutoffCells() {
  const spreadsheetId =
    process.env.OPENING_BALANCE_SPREADSHEET_ID ||
    process.env.SPREADSHEET_ID ||
    SPREADSHEET_ID_DEFAULT;
  const token = await getGoogleAccessToken();
  const cutoff = new Date(`${cutoffDate}T00:00:00Z`);

  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error(`Sheet meta failed: ${await metaRes.text()}`);
  const meta = await metaRes.json();
  const titles = [];
  for (const gid of SHEET_GIDS) {
    const sheet = (meta.sheets || []).find((s) => String(s.properties.sheetId) === String(gid));
    if (sheet) titles.push(sheet.properties.title);
  }

  const byStand = new Map();
  for (const title of titles) {
    const range = encodeURIComponent(`${title}!A:ZZ`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Read tab ${title} failed: ${await res.text()}`);
    const matrix = (await res.json()).values || [];
    if (matrix.length < 2) continue;
    const header = matrix[0];
    const standIdx = header.findIndex((h) => String(h ?? "").toLowerCase().includes("stand number"));
    if (standIdx < 0) continue;

    const monthCols = [];
    for (let i = 0; i < header.length; i++) {
      const month = parseMonthHeader(header[i]);
      if (month && month >= cutoff) monthCols.push({ col: i, dateISO: monthISO(month) });
    }
    console.log(`Sheet "${title}": ${monthCols.length} post-cutoff month column(s)`);

    for (let r = 1; r < matrix.length; r++) {
      const row = matrix[r];
      const stand = normStand(row[standIdx]);
      if (!stand || /^(777777|999999|5555577)$/.test(stand)) continue;
      if (standFilter && stand !== standFilter) continue;
      let entry = byStand.get(stand);
      if (!entry) {
        entry = { stand, cells: [] };
        byStand.set(stand, entry);
      }
      for (const { col, dateISO } of monthCols) {
        const amount = Math.round(parseMoney(row[col]) * 100) / 100;
        if (amount <= 0) continue;
        // Prefer first tab if duplicate stand+date
        if (entry.cells.some((c) => c.dateISO === dateISO && c.col === col)) continue;
        if (entry.cells.some((c) => c.dateISO === dateISO)) continue;
        entry.cells.push({ dateISO, amount, col, sheet: title });
      }
    }
  }
  for (const e of byStand.values()) {
    e.cells.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }
  return { byStand, spreadsheetId };
}

async function odooGetContract(stand) {
  const res = await fetch(
    `${odooOrigin}/lakecity/api/v1/loan/get?stand_number=${encodeURIComponent(stand)}`,
    { headers: odooHeaders },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) return null;
  return json.contract || null;
}

async function odooPostPayment(body) {
  if (dryRun) {
    console.log(`[DRY] payment/post`, JSON.stringify(body));
    return { ok: true };
  }
  const res = await fetch(`${odooOrigin}/lakecity/api/v1/payment/post`, {
    method: "POST",
    headers: odooHeaders,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json;
}

async function main() {
  if (!odooOrigin || !apiToken) {
    console.error("Missing ODOO_ORIGIN / LAKECITY_LOAN_API_TOKEN");
    process.exit(1);
  }
  console.log(`Import sheet receipts on/after ${cutoffDate} (keep opening-balance pre-cutover lump)`);
  console.log(`Dry-run: ${dryRun ? "yes" : "no"}`);
  if (standFilter) console.log(`Filter: stand ${standFilter}`);

  const { byStand, spreadsheetId } = await loadPostCutoffCells();
  console.log(`Spreadsheet ${spreadsheetId}: ${byStand.size} stand(s) with post-cutoff cells\n`);

  let ok = 0;
  let payments = 0;
  let skippedNoContract = 0;
  let skippedNoCells = 0;
  let failures = 0;

  const stands = [...byStand.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const stand of stands) {
    const { cells } = byStand.get(stand);
    if (!cells.length) {
      skippedNoCells++;
      continue;
    }
    try {
      const contract = await odooGetContract(stand);
      if (!contract?.external_uid) {
        skippedNoContract++;
        console.log(`SKIP stand ${stand}: no Odoo contract`);
        await sleep(40);
        continue;
      }
      let standPay = 0;
      for (const cell of cells) {
        const ext = `sheet-postcutoff-${stand}-${cell.dateISO}`;
        await odooPostPayment({
          external_uid: ext,
          contract_external_uid: contract.external_uid,
          amount: cell.amount,
          payment_date: cell.dateISO,
          source: "manual",
          reference: `Collection schedule ${cell.sheet} ${cell.dateISO}`,
          state: "posted",
        });
        standPay += cell.amount;
        payments++;
        await sleep(dryRun ? 0 : 50);
      }
      ok++;
      const after = dryRun ? null : await odooGetContract(stand);
      console.log(
        `OK  stand ${stand}: ${cells.length} receipt(s) Σ ${standPay.toFixed(2)}` +
          (after
            ? ` → paid ${Number(after.total_paid).toFixed(2)} / bal ${Number(after.current_balance).toFixed(2)}`
            : ""),
      );
    } catch (e) {
      failures++;
      console.error(`FAIL stand ${stand}:`, e.message);
    }
    await sleep(dryRun ? 0 : 40);
  }

  console.log(
    `\nDone: ${ok} stands, ${payments} payments posted, ${skippedNoContract} no-contract, ${skippedNoCells} empty, ${failures} failures`,
  );
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
