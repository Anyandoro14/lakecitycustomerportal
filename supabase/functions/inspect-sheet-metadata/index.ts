// Lists all sheet tabs (name, sheetId, gridProperties) for the configured spreadsheet.
// Useful to identify duplicate tabs and hidden/new tabs.
import { getGoogleAccessToken } from "../_shared/google-auth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const spreadsheetId = Deno.env.get("SPREADSHEET_ID");
    if (!spreadsheetId) throw new Error("SPREADSHEET_ID not set");
    const token = await getGoogleAccessToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets(properties(sheetId,title,index,hidden,gridProperties))`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return new Response(JSON.stringify(data, null, 2), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
