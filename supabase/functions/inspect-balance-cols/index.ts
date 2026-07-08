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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const { tab = "Collection Schedule - 36mo" } = await req.json().catch(() => ({}));
  const ssId = Deno.env.get("SPREADSHEET_ID")!;
  const token = await getAccessToken();
  // Read col K (PAYMENT / instalment) and col J (installments count) for sanity
  const ranges = ["B2:B200","J2:J200","K2:K200"].map(r=>`${tab}!${r}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values:batchGet?` + ranges.map(r=>`ranges=${encodeURIComponent(r)}`).join("&");
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  const b = j.valueRanges?.[0]?.values || [];
  const J = j.valueRanges?.[1]?.values || [];
  const K = j.valueRanges?.[2]?.values || [];
  const rows = b.map((x:any,i:number)=>({row:i+2,stand:x?.[0],installments:J[i]?.[0],payment:K[i]?.[0]}));
  const suspicious = rows.filter((r:any)=>{
    const p = String(r.payment ?? "").replace(/[$,\s]/g,"");
    const n = parseFloat(p);
    return !isNaN(n) && n > 0 && n < 200;
  });
  return new Response(JSON.stringify({ tab, count: rows.length, suspiciousPayments: suspicious.slice(0,20), sample: rows.slice(0,10) }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
