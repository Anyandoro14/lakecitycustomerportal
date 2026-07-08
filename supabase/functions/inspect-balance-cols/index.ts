const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

async function getAccessToken(): Promise<string> {
  const keyString = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || "";
  let pk: string, email: string;
  try { const c = JSON.parse(keyString.replace(/\\n/g, "\n")); pk = c.private_key; email = c.client_email; }
  catch { pk = keyString; email = Deno.env.get("GOOGLE_CLIENT_EMAIL") || ""; }
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
const colLetter = (i: number) => { let n = i + 1, s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const { tab = "Collection Schedule - 36mo", row = 2 } = await req.json().catch(() => ({}));
  const ssId = Deno.env.get("SPREADSHEET_ID")!;
  const token = await getAccessToken();
  // Get all headers
  const hRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`${tab}!1:1`)}`, { headers: { Authorization: `Bearer ${token}` } });
  const hdr = (await hRes.json()).values?.[0] || [];
  const rRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`${tab}!${row}:${row}`)}`, { headers: { Authorization: `Bearer ${token}` } });
  const rowVals = (await rRes.json()).values?.[0] || [];
  const fRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`${tab}!${row}:${row}`)}?valueRenderOption=FORMULA`, { headers: { Authorization: `Bearer ${token}` } });
  const rowForm = (await fRes.json()).values?.[0] || [];

  // Show cols 175-193
  const slice = [];
  for (let i = 175; i < Math.max(hdr.length, rowVals.length, 195); i++) {
    slice.push({ idx: i, letter: colLetter(i), header: hdr[i] ?? "", value: rowVals[i] ?? "", formula: rowForm[i] ?? "" });
  }
  // Find headers matching balance/paid/progress
  const findMatches = (re: RegExp) => hdr.map((h: any, i: number) => ({ i, letter: colLetter(i), h })).filter((x: any) => x.h && re.test(String(x.h)));
  return new Response(JSON.stringify({
    tab, row, totalHeaderCols: hdr.length,
    matches: {
      totalPaid: findMatches(/total\s*paid/i),
      currentBalance: findMatches(/current\s*balance/i),
      paymentProgress: findMatches(/payment\s*progress/i),
      nextPayment: findMatches(/next\s*payment/i),
    },
    cols175plus: slice,
  }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
