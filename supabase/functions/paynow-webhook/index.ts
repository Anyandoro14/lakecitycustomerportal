import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import {
  fieldsToRecord,
  loadPaynowCredentials,
  parsePaynowBody,
  pollPaynowStatus,
  verifyPaynowHash,
} from "../_shared/paynow.ts";
import { settlePaynowTransaction } from "../_shared/paynow-settle.ts";
import { resolveDefaultTenantId } from "../_shared/portal-enrollment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const rawBody = await req.text();
    const fields = parsePaynowBody(rawBody);
    const rec = fieldsToRecord(fields);
    const merchantReference = rec.reference;

    if (!merchantReference) {
      return new Response("Missing reference", { status: 400, headers: corsHeaders });
    }

    const { data: tx } = await supabase
      .from("payment_transactions")
      .select("tenant_id")
      .eq("gateway", "paynow")
      .eq("gateway_reference", merchantReference)
      .maybeSingle();

    const tenantId = tx?.tenant_id || await resolveDefaultTenantId(supabase);
    const credentials = await loadPaynowCredentials(supabase, tenantId);
    if (!credentials) {
      console.error("paynow-webhook: credentials missing");
      return new Response("Paynow not configured", { status: 503, headers: corsHeaders });
    }

    if (fields.some((f) => f.key.toUpperCase() === "HASH")) {
      const valid = await verifyPaynowHash(fields, credentials.key);
      if (!valid) {
        console.error("paynow-webhook: invalid hash for", merchantReference);
        return new Response("Invalid hash", { status: 401, headers: corsHeaders });
      }
    }

    let status = rec.status;
    let amount = Number(rec.amount);
    let paynowReference = rec.paynowreference;
    let pollurl = rec.pollurl;
    let paymentchannel = rec.paymentchannel;
    const confirmed = rec;

    if (pollurl) {
      const polled = await pollPaynowStatus(pollurl, credentials.key);
      if (polled.ok) {
        status = polled.fields.status || status;
        if (polled.fields.amount) amount = Number(polled.fields.amount);
        paynowReference = polled.fields.paynowreference || paynowReference;
        paymentchannel = polled.fields.paymentchannel || paymentchannel;
        Object.assign(confirmed, polled.fields);
      } else {
        console.warn("paynow-webhook poll failed:", polled.error);
      }
    }

    if (!tenantId) {
      return new Response("Tenant not found", { status: 500, headers: corsHeaders });
    }

    await settlePaynowTransaction(supabase, supabaseUrl, serviceKey, {
      tenantId,
      merchantReference,
      amount: Number.isFinite(amount) ? amount : undefined,
      status,
      paynowReference,
      pollurl,
      paymentchannel,
      raw: confirmed,
    });

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("paynow-webhook error:", error);
    return new Response(
      error instanceof Error ? error.message : "Internal server error",
      { status: 500, headers: corsHeaders },
    );
  }
});
