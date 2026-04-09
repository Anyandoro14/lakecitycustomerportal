#!/usr/bin/env node
/**
 * Renames the Google Sheets tab "Collection Schedule 1" → "Collection Schedule - 36mo".
 *
 * Requires environment (e.g. `node --env-file=.env` on Node 20+, or export manually):
 *   GOOGLE_SERVICE_ACCOUNT_KEY — JSON string with private_key and client_email (same as Edge Functions)
 *   SPREADSHEET_ID — spreadsheet id
 *
 * Idempotent: if the old tab is missing but the new title already exists, exits 0.
 */

import { createSign } from "node:crypto";

const OLD_TITLE = "Collection Schedule 1";
const NEW_TITLE = "Collection Schedule - 36mo";

function base64url(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getGoogleAccessToken() {
  const keyString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "";
  if (!keyString.trim()) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  }

  let privateKeyPem;
  let clientEmail;
  try {
    const credentials = JSON.parse(keyString.replace(/\\n/g, "\n"));
    privateKeyPem = credentials.private_key;
    clientEmail = credentials.client_email;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY must be valid JSON (service account)");
  }

  if (!privateKeyPem || !clientEmail) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY must include private_key and client_email");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const jwtHeader = base64url(JSON.stringify(header));
  const jwtClaimSet = base64url(JSON.stringify(claimSet));
  const signatureInput = `${jwtHeader}.${jwtClaimSet}`;

  const sign = createSign("RSA-SHA256");
  sign.update(signatureInput);
  const sigBuf = sign.sign(privateKeyPem);
  const signature = Buffer.from(sigBuf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${signatureInput}.${signature}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const t = await tokenResponse.text();
    throw new Error(`OAuth token failed: ${tokenResponse.status} ${t}`);
  }

  const { access_token } = await tokenResponse.json();
  return access_token;
}

async function main() {
  const spreadsheetId = process.env.SPREADSHEET_ID?.trim();
  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID is not set");
  }

  const access_token = await getGoogleAccessToken();

  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!metaRes.ok) {
    const t = await metaRes.text();
    throw new Error(`Metadata fetch failed: ${metaRes.status} ${t}`);
  }

  const meta = await metaRes.json();
  const sheets = meta.sheets || [];

  let sheetId = null;
  let currentTitle = null;
  for (const s of sheets) {
    const t = s.properties?.title;
    if (t === OLD_TITLE) {
      sheetId = s.properties.sheetId;
      currentTitle = t;
      break;
    }
  }

  if (sheetId == null) {
    const hasNew = sheets.some((s) => s.properties?.title === NEW_TITLE);
    if (hasNew) {
      console.log(`OK: Tab already named "${NEW_TITLE}" (legacy "${OLD_TITLE}" not found).`);
      process.exit(0);
    }
    throw new Error(
      `No sheet titled "${OLD_TITLE}" found. Available: ${sheets.map((s) => s.properties?.title).filter(Boolean).join(", ")}`,
    );
  }

  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const batchRes = await fetch(batchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              title: NEW_TITLE,
            },
            fields: "title",
          },
        },
      ],
    }),
  });

  if (!batchRes.ok) {
    const t = await batchRes.text();
    throw new Error(`batchUpdate failed: ${batchRes.status} ${t}`);
  }

  console.log(`Renamed "${currentTitle}" → "${NEW_TITLE}" (sheetId ${sheetId}).`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
