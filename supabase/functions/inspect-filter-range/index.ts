// Diagnoses filter range, blank rows, merges, and Col A type mix for the 36mo tab.
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
  const claim = b64u(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }));
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

    // Get sheet metadata incl. filter, merges
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title,gridProperties),basicFilter,merges)`;
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
    const meta = await metaRes.json();
    const sheet = (meta.sheets || []).find((s: any) => s.properties?.title === targetTitle);
    if (!sheet) throw new Error("target tab not found");

    const filter = sheet.basicFilter || null;
    const merges = sheet.merges || [];
    const mergesInColA = merges.filter((m: any) => m.startColumnIndex === 0);
    const mergesAffectingA = merges.filter((m: any) => m.startColumnIndex <= 0 && m.endColumnIndex > 0);

    // Fetch Col A and full row emptiness check (rows 1..144), plus first few cols to check blank rows
    const range = encodeURIComponent(`${targetTitle}!A1:M144`);
    const valRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const vals = await valRes.json();
    const rows: any[][] = vals.values || [];

    const colA: Array<{ row: number; value: any; type: string; raw: string }> = [];
    const blankRows: number[] = [];
    for (let i = 0; i < 144; i++) {
      const r = rows[i] || [];
      const a = r[0];
      const isBlank = r.every((c: any) => c === "" || c === null || c === undefined);
      if (isBlank) blankRows.push(i + 1);
      if (i >= 65 && i <= 105) {
        colA.push({
          row: i + 1,
          value: a,
          type: a === undefined || a === "" ? "empty" : typeof a,
          raw: JSON.stringify(a),
        });
      }
    }

    // Type histogram of col A (all rows past header)
    const typeHist: Record<string, number> = {};
    for (let i = 1; i < 144; i++) {
      const a = (rows[i] || [])[0];
      const t = a === undefined || a === "" || a === null ? "empty"
        : typeof a === "number" ? "number"
        : typeof a === "string" && /^\s|\s$/.test(a) ? "string(padded)"
        : typeof a;
      typeHist[t] = (typeHist[t] || 0) + 1;
    }

    return new Response(JSON.stringify({
      tab: targetTitle,
      gridRows: sheet.properties?.gridProperties?.rowCount,
      basicFilter: filter ? {
        range: filter.range,
        rangeInterpretation: filter.range
          ? `rows ${(filter.range.startRowIndex ?? 0) + 1}..${filter.range.endRowIndex ?? "end"}, cols ${(filter.range.startColumnIndex ?? 0) + 1}..${filter.range.endColumnIndex ?? "end"}`
          : "unbounded",
      } : "NO BASIC FILTER SET",
      mergesInColA: mergesInColA.length,
      mergesAffectingColA: mergesAffectingA,
      blankRowsBetween1And144: blankRows,
      colATypeHistogram: typeHist,
      colARows66to106: colA,
    }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
