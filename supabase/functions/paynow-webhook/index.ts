import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { getPaynowCredentials, parsePaynowResponse, verifyHash } from "../_shared/paynow.ts";
import { settlePaynowTransaction } from "../_shared/paynow-settle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const raw = await req.text();
    const payload = parsePaynowResponse(raw);

    const { key } = getPaynowCredentials();
    const hashValid = await verifyHash(payload, key);
    if (!hashValid) {
      // Paynow's callback hashing occasionally differs from the documented
      // field order/encoding. Rather than dropping the payment, we ignore the
      // untrusted payload and re-confirm the status directly with Paynow using
      // the poll URL we stored when the payment was started.
      console.warn("Paynow webhook: hash verification failed — verifying via stored poll URL instead");
    }

    const reference = payload.reference || "";
    if (!reference) {
      return new Response("Missing reference", { status: 400, headers: corsHeaders });
    }

    const outcome = await settlePaynowTransaction(
      supabase,
      reference,
      hashValid
        ? { pollUrl: payload.pollurl, paynowStatus: payload.status, payload }
        : {},
    );


    console.log(`Paynow webhook ${reference}: status=${outcome.status} paid=${outcome.paid}`);
    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    console.error("paynow-webhook error:", e);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
