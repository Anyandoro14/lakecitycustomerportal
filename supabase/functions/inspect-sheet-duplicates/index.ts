// Checks for duplicate stand numbers within each Collection Schedule tab.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getAccessToken(): Promise<string> {
  const keyString = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || "";
  const clientEmailEnv = Deno.env.get("GOOGLE_CLIENT_EMAIL") || "";
  let privateKeyPem: string;
  let email: string;
  try {
    const c = JSON.parse(keyString.replace(/\\n/g, "\n"));
    privateKeyPem = c.private_key;
    email = c.client_email;
  } catch {
    privateKeyPem = keyString;
    email = clientEmailEnv;
  }
  const b64u = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64u(JSON.stringify({
    iss: email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now,
  }));
  const signingInput = `${header}.${claim}`;
  const normalized = privateKeyPem.replace(/\r/g, "").replace(/\\n/g, "\n");
  const m = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END/);
  const body = (m ? m[1] : normalized).replace(/[^A-Za-z0-9+/=]/g, "");
  const raw = atob(body);
  const buf = new ArrayBuffer(raw.length);
  const v = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) v[i] = raw.charCodeAt(i);
  const key = await crypto.subtle.importKey("pkcs8", buf, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const sigB64 = b64u(String.fromCharCode(...new Uint8Array(sig)));
  const jwt = `${signingInput}.${sigB64}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  return (await r.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const spreadsheetId = Deno.env.get("SPREADSHEET_ID");
    const token = await getAccessToken();
    const tabs = ["Collection Schedule - 36mo", "Collection Schedule - 48mo", "Collection Schedule - 36mo-BACKUP"];
    const report: any = {};
    for (const tab of tabs) {
      const range = `${tab}!A1:D`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const rows: string[][] = data.values || [];
      const header = rows[0] || [];
      // Find stand number column (case-insensitive)
      const idx = header.findIndex((h) => /stand/i.test(String(h)));
      const counts: Record<string, number[]> = {};
      for (let i = 1; i < rows.length; i++) {
        const stand = String(rows[i]?.[idx] ?? "").trim();
        if (!stand) continue;
        (counts[stand] ||= []).push(i + 1); // 1-based sheet row
      }
      const dupes = Object.entries(counts)
        .filter(([, r]) => r.length > 1)
        .map(([stand, rowsAt]) => ({ stand, rowsAt, count: rowsAt.length }));
      report[tab] = {
        totalRows: rows.length - 1,
        standColumnHeader: header[idx],
        standColumnIndex: idx,
        duplicateStandCount: dupes.length,
        duplicates: dupes,
      };
    }
    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
