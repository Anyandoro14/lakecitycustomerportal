// Public stand-sales wizard actions (access token) and staff queue actions (staff JWT).
// Does not send customer email or WhatsApp. Paynow is not used here.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { iveriConfigFromEnv } from "../_shared/iveri.ts";
import { SalesError, createApplication, createPortalLogin, dismissForStaff, queueForStaff, recheckAttempt, sha256Hex, submitOffer } from "../_shared/stand-sales-service.ts";
import { corsHeaders, envGet, json } from "../_shared/stand-sales-http.ts";
import { createSupabaseStore, lakecityTenantId } from "../_shared/stand-sales-store.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const db = createClient(envGet("SUPABASE_URL") ?? "", envGet("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const store = createSupabaseStore(db, await lakecityTenantId(db));
    switch (body.action) {
      case "list-stands":
        return json({ stands: await store.listStands() });
      case "get": {
        const app = await store.getApplication(String(body.applicationId ?? ""));
        if (!app || (await sha256Hex(String(body.accessToken ?? ""))) !== app.accessTokenHash) {
          return json({ error: "This application link is not valid." }, 403);
        }
        return json({
          application: {
            id: app.id,
            standNumber: app.standNumber,
            fullName: app.fullName,
            email: app.email,
            phone: app.phone,
            stage: app.stage,
            offer: app.offer,
            paidAt: app.paidAt,
            paymentReference: app.paymentReference,
            paymentAmountCents: app.paymentAmountCents,
            portalReady: Boolean(app.portalUserId),
          },
        });
      }
      case "start":
        return json(await createApplication(store, body));
      case "submit-offer":
        return json(await submitOffer(store, { applicationId: body.applicationId, accessToken: body.accessToken, offer: body.offer ?? {} }));
      case "create-portal-login":
        return json(await createPortalLogin(store, body));
      case "staff-queue":
      case "staff-dismiss": {
        const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
        const { data } = await db.auth.getUser(token);
        if (!data.user) return json({ error: "Please sign in as LakeCity staff." }, 401);
        if (body.action === "staff-dismiss") {
          const config = iveriConfigFromEnv(envGet);
          if ("disabled" in config) return json({ error: "Card payments are off, so this attempt cannot be re-checked before dismiss." }, 503);
          const reference = String(body.reference ?? "");
          return json(await dismissForStaff(store, data.user.id, reference, (row) => recheckAttempt(store, config, row)));
        }
        return json({ rows: await queueForStaff(store, data.user.id) });
      }
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    if (error instanceof SalesError) return json({ error: error.message, code: error.code }, error.status);
    console.error("[stand-sales]", error instanceof Error ? error.message : "unknown");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
