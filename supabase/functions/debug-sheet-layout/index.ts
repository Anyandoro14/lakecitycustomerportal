import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { resolveCollectionScheduleSheetTitle } from "../_shared/collection-schedule-sheets.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getGoogleAccessToken(): Promise<string> {
  const keyString = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY') || '';
  const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL') || '';
  let privateKeyPem: string, serviceAccountEmail: string;
  try {
    const c = JSON.parse(keyString.replace(/\\n/g, '\n'));
    privateKeyPem = c.private_key; serviceAccountEmail = c.client_email;
  } catch { privateKeyPem = keyString; serviceAccountEmail = clientEmail; }
  const now = Math.floor(Date.now() / 1000);
  const b64u = (s: string) => btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const h = b64u(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const p = b64u(JSON.stringify({iss:serviceAccountEmail,scope:"https://www.googleapis.com/auth/spreadsheets.readonly",aud:"https://oauth2.googleapis.com/token",exp:now+3600,iat:now}));
  const si = `${h}.${p}`;
  const norm = (pem:string) => { const n=(pem||'').replace(/\r/g,'').replace(/\\n/g,'\n'); const m=n.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/); let b=(m?m[1]:n).replace(/[^A-Za-z0-9+/=\n]/g,'').replace(/\n/g,''); const pad=b.length%4; if(pad===2)b+='=='; else if(pad===3)b+='='; return b; };
  const raw=atob(norm(privateKeyPem)); const buf=new ArrayBuffer(raw.length); const v=new Uint8Array(buf); for(let i=0;i<raw.length;i++)v[i]=raw.charCodeAt(i);
  const pk=await crypto.subtle.importKey("pkcs8",buf,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pk,new TextEncoder().encode(si));
  const jwt=`${si}.${b64u(String.fromCharCode(...new Uint8Array(sig)))}`;
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt})});
  if(!r.ok) throw new Error('Token failed');
  return (await r.json()).access_token;
}

function colLetter(i: number): string { let l='',t=i; while(t>=0){l=String.fromCharCode((t%26)+65)+l;t=Math.floor(t/26)-1;} return l; }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!spreadsheetId) throw new Error('SPREADSHEET_ID not set');
    const accessToken = await getGoogleAccessToken();

    // Get metadata
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const meta = await metaRes.json();
    const sheets = meta.sheets || [];
    const tabNames = sheets.map((s: any) => s.properties?.title);

    const resolved = resolveCollectionScheduleSheetTitle(sheets, {
      paymentPlanMonths: 36,
      envPreferredName: Deno.env.get('SHEET_NAME'),
      envPreferredGid: Deno.env.get('SHEET_GID'),
    });

    // Fetch header row + first 3 data rows with FULL width
    const range = encodeURIComponent(`${resolved.sheetTitle}!A1:GZ5`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    const rows = data.values || [];
    const headers = rows[0] || [];

    // Build column map
    const columnMap: Record<string, { index: number; letter: string; value: string }> = {};
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i]?.toString().trim();
      if (h) {
        columnMap[`${colLetter(i)} (${i})`] = { index: i, letter: colLetter(i), value: h };
      }
    }

    // Find stand 5555577 in the data rows
    let standRow: any = null;
    let standRowIdx = -1;
    for (let r = 1; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (rows[r][c]?.toString().trim() === '5555577') {
          standRow = rows[r];
          standRowIdx = r + 1;
          break;
        }
      }
      if (standRow) break;
    }

    // If not in first 5 rows, search column B
    if (!standRow) {
      const standCol = headers.findIndex((h: string) => h?.toString().toLowerCase().includes('stand'));
      const searchRange = encodeURIComponent(`${resolved.sheetTitle}!A:A`);
      // Search broader
      const searchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${resolved.sheetTitle}!A1:GZ`)}`;
      const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const searchData = await searchRes.json();
      const allRows = searchData.values || [];
      for (let r = 1; r < allRows.length; r++) {
        const sc = standCol >= 0 ? standCol : 0;
        if (allRows[r]?.[sc]?.toString().trim() === '5555577') {
          standRow = allRows[r];
          standRowIdx = r + 1;
          break;
        }
      }
    }

    // Build stand data map showing non-empty cells
    const standData: Record<string, string> = {};
    if (standRow) {
      for (let i = 0; i < standRow.length; i++) {
        const v = standRow[i]?.toString().trim();
        if (v) {
          const hdr = headers[i]?.toString().trim() || '(no header)';
          standData[`${colLetter(i)}${standRowIdx} [${i}] "${hdr}"`] = v;
        }
      }
    }

    return new Response(JSON.stringify({
      resolvedTab: resolved,
      allTabs: tabNames,
      totalHeaderColumns: headers.length,
      columnMap,
      standRowNumber: standRowIdx,
      standNonEmptyCells: standData,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
