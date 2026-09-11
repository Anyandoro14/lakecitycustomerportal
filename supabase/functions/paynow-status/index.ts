import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { settlePaynowTransaction } from "../_shared/paynow-settle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    if (!token) return json({ success: false, error: "Not signed in" });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return json({ success: false, error: "Session expired, please sign in again" });

    const url = new URL(req.url);
    let reference = url.searchParams.get("reference") || "";
    if (!reference && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      reference = (body.reference as string) || "";
    }
    if (!reference) return json({ success: false, error: "Missing payment reference" });

    // Only the owner of the transaction may poll it.
    const { data: txn } = await supabase
      .from("payment_transactions")
      .select("id, user_id, status, amount_usd, stand_number")
      .eq("gateway", "paynow")
      .eq("gateway_reference", reference)
      .maybeSingle();

    if (!txn) return json({ success: false, error: "Payment not found" });
    if (txn.user_id && txn.user_id !== user.id) {
      return json({ success: false, error: "Payment not found" });
    }

    const outcome = await settlePaynowTransaction(supabase, reference);

    return json({
      success: true,
      reference,
      paid: outcome.paid,
      status: outcome.status,
      amount: txn.amount_usd,
      stand_number: txn.stand_number,
      receipt_id: outcome.receipt_id ?? null,
    });
  } catch (e) {
    console.error("paynow-status error:", e);
    return json({ success: false, error: e instanceof Error ? e.message : "Unexpected error" });
  }
});
