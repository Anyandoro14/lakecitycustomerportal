// Copies the Next Payment formula from Collection Schedule - 36mo to - 48mo (all data rows).
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

async function findNextPaymentCol(token: string, ssId: string, tab: string) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`${tab}!1:1`)}?valueRenderOption=UNFORMATTED_VALUE`, { headers: { Authorization: `Bearer ${token}` } });
  const hdr = (await r.json()).values?.[0] || [];
  const idx = hdr.findIndex((h: any) => String(h ?? "").toLowerCase().includes("next payment"));
  return { idx, letter: colLetter(idx), header: hdr[idx] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { dryRun = true, sourceTab = "Collection Schedule - 36mo", targetTab = "Collection Schedule - 48mo", sourceRow = 2 } = await req.json().catch(() => ({}));
    const ssId = Deno.env.get("SPREADSHEET_ID")!;
    const token = await getAccessToken();

    const src = await findNextPaymentCol(token, ssId, sourceTab);
    const tgt = await findNextPaymentCol(token, ssId, targetTab);
    if (src.idx < 0) throw new Error(`No 'Next Payment' col in ${sourceTab}`);
    if (tgt.idx < 0) throw new Error(`No 'Next Payment' col in ${targetTab}`);

    // Read source formula
    const fRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`${sourceTab}!${src.letter}${sourceRow}`)}?valueRenderOption=FORMULA`, { headers: { Authorization: `Bearer ${token}` } });
    const srcFormula = (await fRes.json()).values?.[0]?.[0] || "";
    if (!srcFormula || !String(srcFormula).startsWith("=")) throw new Error(`Source row ${sourceRow} has no formula: "${srcFormula}"`);

    // Determine target row count (based on Column B length)
    const bRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`${targetTab}!B:B`)}`, { headers: { Authorization: `Bearer ${token}` } });
    const bRows = (bRes.ok ? (await bRes.json()).values : []) || [];
    const lastRow = bRows.length;
    if (lastRow < 2) throw new Error(`Target tab ${targetTab} has no data rows`);

    // Rewrite formula per row: replace source tab refs with target tab refs, and re-anchor row number
    // Source formula references its own rows (e.g. $M2:$FX2). We shift each row by (targetRow - sourceRow).
    const srcTabEsc = sourceTab.replace(/'/g, "''");
    const tgtTabEsc = targetTab.replace(/'/g, "''");
    const srcTabRe = new RegExp(`'${srcTabEsc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`, "g");
    const buildRowFormula = (targetRow: number): string => {
      const shift = targetRow - sourceRow;
      let f = String(srcFormula).replace(/(\$?[A-Z]{1,3})(\$?)(\d+)/g, (_m, col, absRow, rowNum) => {
        if (absRow === "$") return `${col}$${rowNum}`;
        return `${col}${parseInt(rowNum, 10) + shift}`;
      });
      // Swap explicit source-tab references (e.g. INDIRECT("'Collection Schedule - 36mo'!..."))
      f = f.replace(srcTabRe, `'${tgtTabEsc}'`);
      return f;
    };

    const values: string[][] = [];
    for (let r = 2; r <= lastRow; r++) values.push([buildRowFormula(r)]);

    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true, sourceTab, targetTab,
        sourceCol: src, targetCol: tgt, sourceFormula: srcFormula,
        targetRange: `${targetTab}!${tgt.letter}2:${tgt.letter}${lastRow}`,
        sampleRows: values.slice(0, 3).map((v, i) => ({ row: i + 2, formula: v[0] })),
        rowCount: values.length,
      }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`${targetTab}!${tgt.letter}2:${tgt.letter}${lastRow}`)}?valueInputOption=USER_ENTERED`;
    const wRes = await fetch(writeUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
    const wJson = await wRes.json();
    if (!wRes.ok) return new Response(JSON.stringify({ error: "Write failed", status: wRes.status, body: wJson }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ success: true, updated: values.length, targetRange: `${targetTab}!${tgt.letter}2:${tgt.letter}${lastRow}`, sourceFormula: srcFormula }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
