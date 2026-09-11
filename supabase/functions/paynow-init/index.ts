import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { initiateTransaction } from "../_shared/paynow.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 100000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Always send the customer back to the portal's /pay/return page with the
 * merchant reference attached — never to a raw edge-function URL.
 */
function buildReturnUrl(returnUrl: string, returnOrigin: string, reference: string): string {
  let base = (returnUrl || "").trim();
  if (!base && returnOrigin) base = `${returnOrigin.replace(/\/+$/, "")}/pay/return`;
  if (!base) return `https://lakecity.standledger.io/pay/return?reference=${encodeURIComponent(reference)}`;
  try {
    const u = new URL(base);
    if (!u.searchParams.get("reference")) u.searchParams.set("reference", reference);
    return u.toString();
  } catch {
    const sep = base.includes("?") ? "&" : "?";
    return base.includes("reference=") ? base : `${base}${sep}reference=${encodeURIComponent(reference)}`;
  }
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("263")) return "0" + digits.slice(3);
  if (digits.startsWith("0")) return digits;
  return "0" + digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    if (!token) return json({ success: false, error: "Not signed in" });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return json({ success: false, error: "Session expired, please sign in again" });

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    const method = body.method as string | undefined; // ecocash | onemoney | innbucks
    const phone = body.phone as string | undefined;
    const returnUrl = (body.return_url as string) || "";
    const returnOrigin = (body.return_origin as string) || "";

    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return json({ success: false, error: `Enter an amount between $${MIN_AMOUNT} and $${MAX_AMOUNT}` });
    }

    // Stand comes from the signed-in customer's profile, never from the client.
    const { data: profile } = await supabase
      .from("profiles")
      .select("stand_number, email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    const standNumber = (profile?.stand_number || "").toString().trim();
    if (!standNumber) {
      return json({ success: false, error: "No property reference is linked to this account" });
    }

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, payment_gateway")
      .eq("slug", "lakecity")
      .maybeSingle();

    if (!tenant) return json({ success: false, error: "Payments are not configured yet" });
    if (tenant.payment_gateway && tenant.payment_gateway !== "paynow") {
      return json({ success: false, error: "Paynow is not the active payment method" });
    }

    const reference = `LC-${standNumber}-${Date.now()}`;
    const authEmail = profile?.email || user.email || "";
    const resultUrl = `${supabaseUrl}/functions/v1/paynow-webhook`;

    const mobileMethod =
      method && ["ecocash", "onemoney", "innbucks"].includes(method) && phone
        ? (method as "ecocash" | "onemoney" | "innbucks")
        : undefined;

    if (method && !mobileMethod) {
      return json({ success: false, error: "A valid mobile number is required for mobile money" });
    }

    const { data: txn, error: txnError } = await supabase
      .from("payment_transactions")
      .insert({
        stand_number: standNumber,
        customer_email: authEmail,
        customer_name: profile?.full_name ?? null,
        amount_usd: amount,
        gateway: "paynow",
        gateway_reference: reference,
        status: "pending",
        settlement_status: "pending",
        user_id: user.id,
        tenant_id: tenant.id,
        metadata: { method: mobileMethod ?? "hosted" },
      })
      .select("id")
      .single();

    if (txnError) {
      console.error("payment_transactions insert failed:", txnError.message);
      return json({ success: false, error: "Could not start the payment" });
    }

    const result = await initiateTransaction({
      reference,
      amount,
      additionalinfo: `Lake City payment for stand ${standNumber}`,
      returnurl: buildReturnUrl(returnUrl, returnOrigin, reference),
      resulturl: resultUrl,
      authemail: authEmail,
      method: mobileMethod,
      phone: mobileMethod ? normalizePhone(phone!) : undefined,
    });

    if (!result.ok) {
      await supabase
        .from("payment_transactions")
        .update({ status: "failed", error_message: result.error, metadata: { raw: result.raw } })
        .eq("id", txn.id);
      return json({ success: false, error: result.error || "Paynow could not start this payment" });
    }

    await supabase
      .from("payment_transactions")
      .update({
        gateway_checkout_url: result.redirectUrl ?? null,
        metadata: {
          method: mobileMethod ?? "hosted",
          poll_url: result.pollUrl,
          instructions: result.instructions ?? null,
        },
      })
      .eq("id", txn.id);

    return json({
      success: true,
      reference,
      redirect_url: result.redirectUrl ?? null,
      instructions: result.instructions ?? null,
      method: mobileMethod ?? "hosted",
    });
  } catch (e) {
    console.error("paynow-init error:", e);
    return json({ success: false, error: e instanceof Error ? e.message : "Unexpected error" });
  }
});
