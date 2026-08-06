// Rewrites the "Next Payment Column" formula so it is AMOUNT-driven:
// next payment month = START DATE (Col L) + number of instalments fully covered by
// TOTAL PAID (Col FZ) minus the deposit (Col H), divided by the monthly instalment (Col K).
// Blank cells in the past are missed payments and no longer shift the result.

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
  const c = b64u(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }));
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

const colLetter = (i: number) => { let n = i + 1, s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

// Column M (index 12) .. FX (index 179) => 168 monthly columns
const LABELS = Array.from({ length: 168 }, (_, i) => `"${colLetter(12 + i)}"`).join(",");

// Amount-driven: start month index + FLOOR((TOTAL PAID - DEPOSIT) / MONTHLY), clamped to the grid.
const buildFormula = (row: number, totalPaidCol: string) =>
  `=IF(OR($L${row}="",N($K${row})=0),"",INDEX({${LABELS}},MIN(168,MAX(1,(YEAR($L${row})-2022)*12+MONTH($L${row})+FLOOR(MAX(0,N($${totalPaidCol}${row})-N($H${row}))/$K${row})))))`;


async function tabInfo(token: string, ssId: string) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}?fields=sheets.properties.title`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  return (j.sheets || []).map((s: any) => s.properties?.title).filter(Boolean) as string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { dryRun = true, tabs: tabsIn } = await req.json().catch(() => ({}));
    const ssId = Deno.env.get("SPREADSHEET_ID")!;
    const token = await getAccessToken();

    const allTitles = await tabInfo(token, ssId);
    const tabs: string[] = tabsIn?.length
      ? tabsIn
      : allTitles.filter((t) => /^Collection Schedule - \d+mo$/i.test(t));

    const results: any[] = [];
    for (const tab of tabs) {
      const hRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`${tab}!1:1`)}?valueRenderOption=UNFORMATTED_VALUE`, { headers: { Authorization: `Bearer ${token}` } });
      const hdr = (await hRes.json()).values?.[0] || [];
      const idx = hdr.findIndex((h: any) => String(h ?? "").toLowerCase().includes("next payment"));
      if (idx < 0) { results.push({ tab, skipped: "no Next Payment column" }); continue; }
      const letter = colLetter(idx);

      const bRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`${tab}!B:B`)}`, { headers: { Authorization: `Bearer ${token}` } });
      const lastRow = ((bRes.ok ? (await bRes.json()).values : []) || []).length;
      if (lastRow < 2) { results.push({ tab, skipped: "no data rows" }); continue; }

      const values: string[][] = [];
      for (let r = 2; r <= lastRow; r++) values.push([buildFormula(r)]);
      const range = `${tab}!${letter}2:${letter}${lastRow}`;

      if (dryRun) {
        results.push({ tab, range, rows: values.length, sample: values[0][0] });
        continue;
      }

      const wRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const wJson = await wRes.json();
      results.push(wRes.ok ? { tab, range, updated: values.length } : { tab, range, error: wJson, status: wRes.status });
    }

    return new Response(JSON.stringify({ dryRun, tabs, results }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
