#!/usr/bin/env node
/**
 * Sync Collection Schedule emails onto Odoo res.partner via Standledger BNPL API.
 *
 * Replaces blank / stand-{N}@lakecity.portal placeholder partner emails.
 * Never overwrites a different real email (those land in `conflicts`).
 *
 * Usage:
 *   node --env-file=.env scripts/sync-partner-emails-from-csv.mjs path/to/stand_email_updates.csv --dry-run
 *   node --env-file=.env scripts/sync-partner-emails-from-csv.mjs path/to/stand_email_updates.csv
 *
 * Env: ODOO_ORIGIN, LAKECITY_LOAN_API_TOKEN (same as Odoo lakecity_loan.api_token)
 *
 * CSV columns (header row required): stand_number, email
 * Optional columns (ignored by API): name, source_sheet
 *
 * Flags:
 *   --dry-run     POST with dry_run=true (server evaluates, does not write)
 *   --local-only  Parse/print payload only; no HTTP
 *   --chunk=N     Batch size (default 200, max 1000)
 */

import fs from "node:fs";
import { parse } from "csv-parse/sync";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--") && !a.includes("=")));
const kvFlags = Object.fromEntries(
  argv
    .filter((a) => a.startsWith("--") && a.includes("="))
    .map((a) => {
      const i = a.indexOf("=");
      return [a.slice(2, i), a.slice(i + 1)];
    }),
);
const argsNonFlags = argv.filter((a) => !a.startsWith("--"));

const dryRun = flags.has("--dry-run");
const localOnly = flags.has("--local-only");
const chunkSize = Math.min(
  1000,
  Math.max(1, Number.parseInt(kvFlags.chunk || "200", 10) || 200),
);

const csvPath = argsNonFlags[0] || process.env.STAND_EMAIL_CSV_PATH || "";
const odooOrigin = (process.env.ODOO_ORIGIN || "").replace(/\/$/, "");
const apiToken = process.env.LAKECITY_LOAN_API_TOKEN || "";

function normHeader(h) {
  return String(h ?? "")
    .replace(/^\ufeff/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function cleanEmail(raw) {
  if (raw == null) return "";
  let s = String(raw).trim();
  const first = s.split(/[\s,;-]+/)[0];
  s = first || s;
  s = s.replace(/\s*@\s*/, "@").trim().toLowerCase();
  if (!s.includes("@")) return "";
  // Drop obvious bad rows (missing TLD / truncated)
  if (!/\.[a-z]{2,}$/i.test(s.split("@")[1] || "")) return "";
  return s;
}

function cleanStand(raw) {
  let s = String(raw ?? "")
    .trim()
    .replace(/^#/, "");
  if (!s || /^totals$/i.test(s)) return "";
  const n = Number.parseFloat(s);
  if (Number.isFinite(n) && n === Math.trunc(n)) return String(Math.trunc(n));
  return s.toUpperCase();
}

function rowByNorm(row) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[normHeader(k)] = v == null ? "" : String(v);
  }
  return out;
}

function pick(r, names) {
  for (const n of names) {
    const k = normHeader(n);
    if (r[k] !== undefined && String(r[k]).trim() !== "") return r[k];
  }
  return "";
}

async function odooPost(path, body) {
  const url = `${odooOrigin}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 400)}`);
  }
  if (!res.ok || json?.ok === false) {
    throw new Error(`HTTP ${res.status} ${path}: ${json?.error || text.slice(0, 400)}`);
  }
  return json;
}

function summarize(label, rows) {
  console.log(`\n=== ${label} (${rows.length}) ===`);
  for (const row of rows.slice(0, 40)) {
    console.log(
      `  stand=${row.stand_number || "?"} old=${row.old_email || "(blank)"} → new=${row.new_email || row.email || ""} [${row.reason || row.status}]`,
    );
  }
  if (rows.length > 40) console.log(`  … +${rows.length - 40} more`);
}

async function main() {
  if (!csvPath) {
    console.error("Missing CSV path. Pass the file as the first argument, e.g.");
    console.error(
      "  node --env-file=.env scripts/sync-partner-emails-from-csv.mjs stand_email_updates.csv --dry-run",
    );
    console.error("Or set STAND_EMAIL_CSV_PATH=/absolute/path/to/file.csv");
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error("CSV file not found:", csvPath);
    process.exit(1);
  }

  const buf = fs.readFileSync(csvPath, "utf8");
  /** @type {Record<string, string>[]} */
  const rows = parse(buf, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  });

  /** @type {{stand_number: string, email: string}[]} */
  const updates = [];
  let parseSkipped = 0;
  const seen = new Set();

  for (const raw of rows) {
    const r = rowByNorm(raw);
    const stand = cleanStand(pick(r, ["stand_number", "Stand Number", "Stand"]));
    const email = cleanEmail(pick(r, ["email", "Email"]));
    if (!stand || !email) {
      parseSkipped++;
      continue;
    }
    if (seen.has(stand)) {
      // Last row wins for duplicate stands in the CSV
      const idx = updates.findIndex((u) => u.stand_number === stand);
      if (idx >= 0) updates[idx] = { stand_number: stand, email };
      continue;
    }
    seen.add(stand);
    updates.push({ stand_number: stand, email });
  }

  console.log(
    `Parsed ${updates.length} stand→email updates from ${csvPath} (${parseSkipped} rows skipped for missing/invalid stand or email)`,
  );

  if (localOnly) {
    console.log("[local-only] sample:", JSON.stringify(updates.slice(0, 3), null, 2));
    console.log(`[local-only] would POST ${Math.ceil(updates.length / chunkSize)} chunk(s) of up to ${chunkSize}`);
    process.exit(0);
  }

  if (!odooOrigin || !apiToken) {
    console.error("Set ODOO_ORIGIN and LAKECITY_LOAN_API_TOKEN (or use --local-only)");
    process.exit(1);
  }

  const allUpdated = [];
  const allSkipped = [];
  const allMissing = [];
  const allConflicts = [];

  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const label = `chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(updates.length / chunkSize)}`;
    console.log(`POST /lakecity/api/v1/partner/email/sync ${label} (${chunk.length} rows)${dryRun ? " [dry_run]" : ""}`);
    const json = await odooPost("/lakecity/api/v1/partner/email/sync", {
      updates: chunk,
      dry_run: dryRun,
    });
    allUpdated.push(...(json.updated || []));
    allSkipped.push(...(json.skipped || []));
    allMissing.push(...(json.missing_contract || []));
    allConflicts.push(...(json.conflicts || []));
  }

  summarize("updated", allUpdated);
  summarize("conflicts (real email already set)", allConflicts);
  summarize("missing_contract", allMissing);
  summarize("skipped", allSkipped);

  console.log("\n=== summary ===");
  console.log({
    dry_run: dryRun,
    parsed: updates.length,
    updated: allUpdated.length,
    skipped: allSkipped.length,
    missing_contract: allMissing.length,
    conflicts: allConflicts.length,
  });

  if (allConflicts.length || allMissing.length) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
