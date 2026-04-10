import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  listCollectionScheduleDataTabTitles,
  paymentColumnBounds,
  DEFAULT_PAYMENT_PLAN_MONTHS,
} from "../_shared/collection-schedule-sheets.ts";

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
  const p = b64u(JSON.stringify({iss:serviceAccountEmail,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",exp:now+3600,iat:now}));
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

const parseCurrency = (v: string): number => { if(!v)return 0; const n=parseFloat(v.toString().replace(/[$,\s]/g,'')); return isNaN(n)?0:n; };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { standNumber, newValue, dryRun } = await req.json();
    if (!standNumber || newValue === undefined) {
      return new Response(JSON.stringify({ error: "standNumber and newValue required" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!spreadsheetId) throw new Error('SPREADSHEET_ID not configured');
    const accessToken = await getGoogleAccessToken();

    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!metaRes.ok) throw new Error('Failed to fetch metadata');
    const sheets = (await metaRes.json()).sheets || [];
    const tabs = listCollectionScheduleDataTabTitles(sheets);
    console.log(`Searching ${tabs.length} tabs for stand "${standNumber}"`);

    const norm = standNumber.toString().trim().toUpperCase();
    let foundTab = '', foundRow = -1, standColIdx = -1;

    for (const tab of tabs) {
      const range = encodeURIComponent(`${tab}!A1:GZ`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) { console.log(`Skip tab ${tab}`); continue; }
      const data = await res.json();
      const rows = data.values || [];
      if (rows.length < 2) continue;

      // Find stand column by header
      const headers = rows[0];
      standColIdx = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('stand'));
      if (standColIdx === -1) continue;

      for (let i = 1; i < rows.length; i++) {
        const v = rows[i]?.[standColIdx]?.toString().trim().toUpperCase() || '';
        if (v === norm) {
          foundTab = tab;
          foundRow = i + 1; // 1-based
          // Find last filled payment column
          const { start: colStart, end: colEnd } = paymentColumnBounds(DEFAULT_PAYMENT_PLAN_MONTHS);
          const rowCells = rows[i] || [];
          let lastIdx = -1;
          // Only search within payment columns (M through end of term)
          const searchEnd = Math.min(colEnd, rowCells.length - 1);
          for (let c = searchEnd; c >= colStart; c--) {
            const cv = rowCells[c]?.toString().trim() || '';
            if (cv && cv !== '0' && cv !== '$0' && cv !== '$0.00') {
              lastIdx = c;
              break;
            }
          }

          if (lastIdx === -1) {
            return new Response(JSON.stringify({ error: `No payments found for stand ${standNumber} in tab "${tab}"` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          const cellRef = `${tab}!${colLetter(lastIdx)}${foundRow}`;
          const oldValue = rowCells[lastIdx];
          const headerDate = headers[lastIdx] || `Column ${colLetter(lastIdx)}`;

          console.log(`Found: ${cellRef} = "${oldValue}" (header: ${headerDate})`);

          if (dryRun) {
            return new Response(JSON.stringify({ dryRun: true, standNumber, sheetTitle: tab, row: foundRow, column: colLetter(lastIdx), columnHeader: headerDate, cellRef, oldValue, newValue }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Write
          const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(cellRef)}?valueInputOption=USER_ENTERED`;
          const updateRes = await fetch(updateUrl, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [[newValue]] }),
          });
          if (!updateRes.ok) throw new Error(`Write failed: ${await updateRes.text()}`);

          console.log(`SUCCESS: ${cellRef} "${oldValue}" -> ${newValue}`);
          return new Response(JSON.stringify({ success: true, standNumber, sheetTitle: tab, row: foundRow, column: colLetter(lastIdx), columnHeader: headerDate, cellRef, oldValue, newValue }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    return new Response(JSON.stringify({ error: `Stand ${standNumber} not found in any Collection Schedule tab` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
