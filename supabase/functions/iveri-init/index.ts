// POST {amount, idempotency_key, billing?} with the customer's JWT.
// Stand + max amount come from the signed-in profile, never the client.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { initOrder, redact } from "../_shared/iveri.ts";
import { iveriDeps } from "../_shared/iveri-deps.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  let cfgForRedact: { appId: string; sharedSecret: string | null } | null = null;
  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    const boot = iveriDeps();
    cfgForRedact = boot.cfg;
    const { data: u } = await boot.sb.auth.getUser(token);
    if (!u?.user) return json({ success: false, error: "Please sign in again" }, 401);
    const { data: profile } = await boot.sb.from("profiles").select("stand_number, email, full_name, phone_number").eq("id", u.user.id).maybeSingle();
    const stand = String(profile?.stand_number || "").trim();
    if (!stand) return json({ success: false, error: "No stand is linked to this account" }, 400);
    const { data: tenant } = await boot.sb.from("tenants").select("id").eq("slug", "lakecity").maybeSingle();
    // Outstanding balance cap (payment_plans view); falls back to a hard cap.
    const { data: plan } = await boot.sb.from("payment_plans").select("current_balance").eq("stand_number", stand).maybeSingle();
    const maxAmount = plan?.current_balance != null ? Number(plan.current_balance).toFixed(2) : Deno.env.get("IVERI_MAX_AMOUNT") || "50000";
    const body = await req.json().catch(() => ({}));
    const [first, ...rest] = String(profile?.full_name || "").split(" ");
    const { deps } = iveriDeps({ userId: u.user.id, tenantId: tenant?.id ?? null });
    const r = await initOrder(deps, {
      stand, amount: body.amount, maxAmount, idempotencyKey: String(body.idempotency_key || ""),
      billing: { email: String(body.billing?.email || profile?.email || u.user.email || ""), firstName: first || undefined, lastName: rest.join(" ") || undefined, phone: profile?.phone_number || undefined },
    });
    return json({ success: true, reference: r.order.reference, amount_cents: r.order.amountCents, currency: r.order.currency, action: r.action, fields: r.fields, reused: r.reused });
  } catch (e) {
    const msg = cfgForRedact ? redact(cfgForRedact, String((e as Error).message)) : "Card payments are not configured";
    return json({ success: false, error: msg }, 400);
  }
});
