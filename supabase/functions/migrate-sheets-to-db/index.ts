import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * One-time Google Sheets → Postgres migration (plan Step 8).
 * Implement row iteration, contract upserts, installment generation, and receipt import
 * before production cutover. Invoke with service role only.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!auth || auth !== serviceKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: false,
      message:
        "migrate-sheets-to-db is not implemented in-repo yet. Use the plan checklist: backfill contracts, generate-installments, import approved payment_receipts, reconcile balances vs column AZ, then switch dashboards to fetch-customer-data.",
    }),
    { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
