// Lists all sheet tabs (title, sheetId, index, hidden, gridProperties) for the configured spreadsheet.
// Used to identify duplicate tabs and hidden/new tabs.

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

  const base64url = (s: string) =>
    btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));
  const signingInput = `${header}.${claim}`;

  const normalized = privateKeyPem.replace(/\r/g, "").replace(/\\n/g, "\n");
  const match = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END/);
  const body = (match ? match[1] : normalized).replace(/[^A-Za-z0-9+/=]/g, "");
  const raw = atob(body);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  const key = await crypto.subtle.importKey(
    "pkcs8", buf, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)
  );
  const sigB64 = base64url(String.fromCharCode(...new Uint8Array(sig)));
  const jwt = `${signingInput}.${sigB64}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = await r.json();
  return j.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const spreadsheetId = Deno.env.get("SPREADSHEET_ID");
    if (!spreadsheetId) throw new Error("SPREADSHEET_ID not set");
    const token = await getAccessToken();

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets(properties(sheetId,title,index,hidden,gridProperties))`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();

    const tabs: Array<{ title: string; sheetId: number; index: number; hidden: boolean; rows: number; cols: number }> =
      (data.sheets || []).map((s: any) => ({
        title: s.properties?.title,
        sheetId: s.properties?.sheetId,
        index: s.properties?.index,
        hidden: !!s.properties?.hidden,
        rows: s.properties?.gridProperties?.rowCount,
        cols: s.properties?.gridProperties?.columnCount,
      }));

    // Group by normalized title to spot duplicates
    const groups: Record<string, typeof tabs> = {};
    for (const t of tabs) {
      const key = (t.title || "").toLowerCase().replace(/\s+/g, " ").trim();
      (groups[key] ||= []).push(t);
    }
    const duplicates = Object.entries(groups)
      .filter(([, arr]) => arr.length > 1)
      .map(([k, arr]) => ({ normalizedTitle: k, count: arr.length, tabs: arr }));

    return new Response(
      JSON.stringify({
        spreadsheetTitle: data.properties?.title,
        totalTabs: tabs.length,
        duplicates,
        tabs,
      }, null, 2),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
