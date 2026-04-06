import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseAmount(raw: unknown): number {
  if (typeof raw === "number" && !isNaN(raw)) return raw;
  const s = (raw ?? "").toString().replace(/[$,\s]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    if (!bearer) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json();
    const tenantId = payload.tenant_id as string | undefined;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vaultKey = `receipt_intake_webhook_secret_${tenantId}`;
    const { data: secret } = await supabase.rpc("vault_read_secret", { secret_name: vaultKey });
    const fallback = Deno.env.get("RECEIPT_INTAKE_WEBHOOK_SECRET") || "";
    const expected = (secret || fallback) as string;

    if (!expected || bearer !== expected) {
      return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stand_number = (payload.stand_number as string)?.toString().trim().toUpperCase() || "";
    const amount = parseAmount(payload.amount);
    const payment_date = (payload.payment_date as string)?.toString().trim() || "";
    const payment_method = (payload.payment_method as string)?.toString().trim() || "";
    const reference = (payload.reference as string)?.toString().trim() || null;
    const receipt_file_url = payload.receipt_file_url
      ? (payload.receipt_file_url as string).toString().trim() || null
      : null;

    if (!stand_number || !payment_date || isNaN(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: "stand_number, payment_date, and positive amount required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error } = await supabase
      .from("payment_receipts")
      .insert({
        tenant_id: tenantId,
        stand_number,
        amount,
        payment_date,
        gateway: "google_form",
        gateway_reference: reference,
        gateway_metadata: { payment_method, source: "receipt-intake-webhook" },
        receipt_file_url,
        qc_status: "pending_qc",
      })
      .select("id")
      .single();

    if (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Insert failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: row?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
