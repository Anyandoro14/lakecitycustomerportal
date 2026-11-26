// Start a stand-sales card payment, or re-check every attempt for that buyer.
// verify_jwt is false: the per-application access token is the credential. iVeri stays off
// unless IVERI_ENVIRONMENT=test. No card data is accepted here.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { iveriConfigFromEnv } from "../_shared/iveri.ts";
import { SalesError, checkCardPayments, handleGatewayReturn, requireBuyer, startCardPayment } from "../_shared/stand-sales-service.ts";
import { corsHeaders, envGet, json } from "../_shared/stand-sales-http.ts";
import { createSupabaseStore, lakecityTenantId } from "../_shared/stand-sales-store.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const config = iveriConfigFromEnv(envGet);
    if ("disabled" in config) return json({ error: "Card payments are not available yet. Please try again later or contact LakeCity Accounts.", code: "iveri_off" }, 503);
    const body = await req.json().catch(() => ({}));
    const db = createClient(envGet("SUPABASE_URL") ?? "", envGet("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const store = createSupabaseStore(db, await lakecityTenantId(db));
    const applicationId = String(body.applicationId ?? "");
    const accessToken = String(body.accessToken ?? "");
    const supabaseUrl = (envGet("SUPABASE_URL") ?? "").replace(/\/$/, "");
    const returnUrl = envGet("IVERI_RETURN_URL") || `${supabaseUrl}/functions/v1/iveri-return`;
    if (body.action === "check") {
      return json(await checkCardPayments({ store, config, applicationId, accessToken }));
    }
    if (body.action === "simulate") {
      if (!config.simulations) return json({ error: "Simulations are disabled.", code: "simulations_off" }, 403);
      const buyer = await requireBuyer(store, String(body.applicationId ?? ""), String(body.accessToken ?? ""));
      const owned = await store.getAttempt(String(body.reference ?? ""));
      if (!owned || owned.applicationId !== buyer.id) return json({ error: "We couldn't find this payment.", code: "not_found" }, 404);
      const cardStatus = body.cardStatus === null || body.cardStatus === "null" ? null : Number(body.cardStatus);
      const amountCents = body.amountCents == null ? 225000 : Number(body.amountCents);
      const nonce = body.nonceMismatch ? "different-nonce" : undefined;
      const merchantReference = body.merchantMismatch ? "LC0000-OTHER" : undefined;
      const attempt = await store.getAttempt(String(body.reference ?? ""));
      const outcome = await handleGatewayReturn({
        store,
        config,
        reference: String(body.reference ?? ""),
        kind: cardStatus === 0 ? "success" : "fail",
        authoriseInfo: async () => ({
          cardStatus: Number.isInteger(cardStatus) || cardStatus === null ? cardStatus : null,
          description: "simulated",
          trace: merchantReference ? "LC0000-OTHER" : String(body.reference ?? ""),
          amountCents,
          currency: body.currency ? String(body.currency) : "USD",
          merchantReference: merchantReference ?? String(body.reference ?? ""),
          nonce: nonce ?? attempt?.nonce ?? "",
        }),
      });
      return json(outcome ?? { error: "Payment not found" });
    }
    const started = await startCardPayment({ store, config, applicationId, accessToken, returnUrl });
    return json(started);
  } catch (error) {
    if (error instanceof SalesError) {
      return json({ error: error.message, code: error.code, outcome: error.outcome ?? null }, error.status);
    }
    console.error("[iveri-init]", error instanceof Error ? error.message : "unknown");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
