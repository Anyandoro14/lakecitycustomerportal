// Expands basic filter on "Collection Schedule - 36mo" to cover all data rows.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getAccessToken(): Promise<string> {
  const keyString = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || "";
  const clientEmailEnv = Deno.env.get("GOOGLE_CLIENT_EMAIL") || "";
  let privateKeyPem: string, email: string;
  try {
    const c = JSON.parse(keyString.replace(/\\n/g, "\n"));
    privateKeyPem = c.private_key; email = c.client_email;
  } catch { privateKeyPem = keyString; email = clientEmailEnv; }
  const b64u = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64u(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }));
  const signingInput = `${header}.${claim}`;
  const normalized = privateKeyPem.replace(/\r/g, "").replace(/\\n/g, "\n");
  const match = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END/);
  const body = (match ? match[1] : normalized).replace(/[^A-Za-z0-9+/=]/g, "");
  const raw = atob(body);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  const key = await crypto.subtle.importKey("pkcs8", buf, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const sigB64 = b64u(String.fromCharCode(...new Uint8Array(sig)));
  const jwt = `${signingInput}.${sigB64}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  return (await r.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const spreadsheetId = Deno.env.get("SPREADSHEET_ID")!;
    const token = await getAccessToken();
    const targetTitle = "Collection Schedule - 36mo";

    // Get sheet metadata
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title,gridProperties))`;
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
    const meta = await metaRes.json();
    const sheet = (meta.sheets || []).find((s: any) => s.properties?.title === targetTitle);
    if (!sheet) throw new Error("target tab not found");
    const sheetId = sheet.properties.sheetId;
    const rowCount = sheet.properties.gridProperties?.rowCount ?? 200;
    const colCount = sheet.properties.gridProperties?.columnCount ?? 194;

    // Determine last non-empty row across all columns (scan Col B stand numbers, plus safety pad)
    const scanUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${targetTitle}!B1:B${rowCount}`)}`;
    const scanRes = await fetch(scanUrl, { headers: { Authorization: `Bearer ${token}` } });
    const scanData = await scanRes.json();
    const rows = scanData.values || [];
    let lastDataRow = 1;
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i]?.[0];
      if (v !== undefined && v !== null && String(v).trim() !== "") lastDataRow = i + 1;
    }
    // Pad a few rows for future entries
    const endRowIndex = Math.min(rowCount, lastDataRow + 5);

    // Clear existing basic filter then set a new one covering full data range
    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const body = {
      requests: [
        { clearBasicFilter: { sheetId } },
        {
          setBasicFilter: {
            filter: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex,
                startColumnIndex: 0,
                endColumnIndex: colCount,
              },
            },
          },
        },
      ],
    };
    const upRes = await fetch(batchUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const upJson = await upRes.json();
    if (!upRes.ok) throw new Error("batchUpdate failed: " + JSON.stringify(upJson));

    return new Response(JSON.stringify({
      ok: true,
      tab: targetTitle,
      newFilterRange: `rows 1..${endRowIndex}, cols 1..${colCount}`,
      lastDataRow,
    }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
