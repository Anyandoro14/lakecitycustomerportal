// Public stand-sales wizard actions (access token or signed-in portal user) and staff actions (staff JWT).
// Does not send customer email or WhatsApp. Paynow is not used here.
// DocuSign stays off unless ENABLE_DOCUSIGN_EXECUTION is exactly "true", and even then this function does not call DocuSign.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { iveriConfigFromEnv } from "../_shared/iveri.ts";
import { docusignExecutionEnabled } from "../_shared/stand-sales-agreement.ts";
import {
  SalesError,
  acknowledgeAndRequestAgreement,
  agreementsForStaff,
  createApplication,
  createPortalLogin,
  dismissForStaff,
  queueForStaff,
  recheckAttempt,
  requireAgreementBuyer,
  staffMarkActionRequired,
  staffMarkCountersigned,
  staffMarkDispatched,
  staffMarkOriginalReceived,
  submitBuyerReturn,
  submitOffer,
  toBuyerPayload,
} from "../_shared/stand-sales-service.ts";
import { corsHeaders, envGet, json } from "../_shared/stand-sales-http.ts";
import { createSupabaseStore, lakecityTenantId } from "../_shared/stand-sales-store.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const db = createClient(envGet("SUPABASE_URL") ?? "", envGet("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const store = createSupabaseStore(db, await lakecityTenantId(db));
    const docusignEnabled = docusignExecutionEnabled(envGet("ENABLE_DOCUSIGN_EXECUTION"));
    switch (body.action) {
      case "list-stands":
        return json({ stands: await store.listStands() });
      case "get":
        return json({ application: toBuyerPayload(await buyer(store, db, req, body)) });
      case "start":
        return json(await createApplication(store, body));
      case "submit-offer":
        return json(await submitOffer(store, { applicationId: body.applicationId, accessToken: body.accessToken, offer: body.offer ?? {} }));
      case "create-portal-login":
        return json(await createPortalLogin(store, body));
      case "acknowledge-and-request-agreement": {
        const app = await buyer(store, db, req, body);
        return json(await acknowledgeAndRequestAgreement(store, app, body, { docusignEnabled }));
      }
      case "submit-buyer-return": {
        const app = await buyer(store, db, req, body);
        return json(await submitBuyerReturn(store, app, body));
      }
      case "staff-queue":
      case "staff-dismiss":
      case "staff-agreements-queue":
      case "staff-mark-dispatched":
      case "staff-mark-original-received":
      case "staff-mark-countersigned":
      case "staff-mark-action-required":
        return json(await staffAction(db, store, req, body));
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    if (error instanceof SalesError) return json({ error: error.message, code: error.code }, error.status);
    console.error("[stand-sales]", error instanceof Error ? error.message : "unknown");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

async function buyer(store: ReturnType<typeof createSupabaseStore>, db: ReturnType<typeof createClient>, req: Request, body: Record<string, unknown>) {
  const portalUser = await portalUserFromRequest(store, db, req);
  return requireAgreementBuyer(store, {
    applicationId: body.applicationId ? String(body.applicationId) : undefined,
    accessToken: body.accessToken ? String(body.accessToken) : undefined,
    standNumber: body.standNumber ? String(body.standNumber) : undefined,
    portalUser,
  });
}

async function portalUserFromRequest(store: ReturnType<typeof createSupabaseStore>, db: ReturnType<typeof createClient>, req: Request) {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  if (!data.user) return null;
  const profile = await store.profileByUserId(data.user.id);
  return { id: data.user.id, standNumber: profile?.standNumber ?? null };
}

async function staffAction(db: ReturnType<typeof createClient>, store: ReturnType<typeof createSupabaseStore>, req: Request, body: Record<string, unknown>) {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  const { data } = await db.auth.getUser(token);
  if (!data.user) throw new SalesError(401, "Please sign in as LakeCity staff.", "staff_required");
  const userId = data.user.id;
  if (body.action === "staff-dismiss") {
    const config = iveriConfigFromEnv(envGet);
    if ("disabled" in config) throw new SalesError(503, "Card payments are off, so this attempt cannot be re-checked before dismiss.", "payments_off");
    const reference = String(body.reference ?? "");
    return dismissForStaff(store, userId, reference, (row) => recheckAttempt(store, config, row));
  }
  if (body.action === "staff-queue") return { rows: await queueForStaff(store, userId) };
  if (body.action === "staff-agreements-queue") return { rows: await agreementsForStaff(store, userId) };
  const applicationId = String(body.applicationId ?? "");
  if (body.action === "staff-mark-dispatched") return staffMarkDispatched(store, userId, applicationId, String(body.tracking ?? ""));
  if (body.action === "staff-mark-original-received") return staffMarkOriginalReceived(store, userId, applicationId);
  if (body.action === "staff-mark-countersigned") return staffMarkCountersigned(store, userId, applicationId);
  if (body.action === "staff-mark-action-required") return staffMarkActionRequired(store, userId, applicationId, String(body.message ?? ""));
  throw new SalesError(400, "Unknown action.", "unknown_action");
}
