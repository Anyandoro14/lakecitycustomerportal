// Inspects next-payment formula & values in Collection Schedule - 36mo
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

async function getAccessToken(): Promise<string> {
  const keyString = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || "";
  const clientEmailEnv = Deno.env.get("GOOGLE_CLIENT_EMAIL") || "";
  let pk: string, email: string;
  try { const c = JSON.parse(keyString.replace(/\\n/g, "\n")); pk = c.private_key; email = c.client_email; }
  catch { pk = keyString; email = clientEmailEnv; }
  const b64u = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const c = b64u(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }));
  const si = `${h}.${c}`;
  const norm = pk.replace(/\r/g, "").replace(/\\n/g, "\n");
  const m = norm.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END/);
  const body = (m ? m[1] : norm).replace(/[^A-Za-z0-9+/=]/g, "");
  const raw = atob(body); const buf = new ArrayBuffer(raw.length); const v = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) v[i] = raw.charCodeAt(i);
  const k = await crypto.subtle.importKey("pkcs8", buf, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", k, new TextEncoder().encode(si));
  const jwt = `${si}.${b64u(String.fromCharCode(...new Uint8Array(sig)))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
  return (await r.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const spreadsheetId = Deno.env.get("SPREADSHEET_ID")!;
    const token = await getAccessToken();
    const tab = "Collection Schedule - 36mo";
    const url = new URL(req.url);
    const npCol = url.searchParams.get("col") || "GM"; // guess "Next Payment" column - user to override

    // First, dump header row to find Next Payment column
    const hdrRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${tab}!1:1`)}?valueRenderOption=UNFORMATTED_VALUE`, { headers: { Authorization: `Bearer ${token}` } });
    const hdr = (await hdrRes.json()).values?.[0] || [];
    const npIdx = hdr.findIndex((h: any) => String(h ?? "").toLowerCase().includes("next payment"));
    const colLetter = (i: number) => { let n = i + 1, s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
    const npColActual = npIdx >= 0 ? colLetter(npIdx) : npCol;

    // Fetch formulas + computed values for that column rows 2-100
    const [fRes, vRes] = await Promise.all([
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${tab}!${npColActual}2:${npColActual}100`)}?valueRenderOption=FORMULA`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${tab}!${npColActual}2:${npColActual}100`)}?valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const formulas = (await fRes.json()).values || [];
    const values = (await vRes.json()).values || [];

    // Also fetch stand + start date (Col B, L) and one sample row's payment cells (M:FX)
    const idRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${tab}!A2:L100`)}?valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: `Bearer ${token}` } });
    const ids = (await idRes.json()).values || [];

    const rows = [];
    for (let i = 0; i < Math.max(formulas.length, values.length); i++) {
      const stand = ids[i]?.[1] ?? "";
      const startDate = ids[i]?.[11] ?? "";
      rows.push({
        row: i + 2,
        stand,
        startDate,
        formula: formulas[i]?.[0] ?? "",
        value: values[i]?.[0] ?? "",
      });
    }

    return new Response(JSON.stringify({
      tab,
      headerRow0to20: hdr.slice(0, 20),
      nextPaymentColumnIndex: npIdx,
      nextPaymentColumnLetter: npColActual,
      nextPaymentHeader: npIdx >= 0 ? hdr[npIdx] : null,
      rows,
    }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
