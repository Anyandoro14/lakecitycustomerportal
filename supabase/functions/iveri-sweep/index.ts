// Re-check unsettled stand-sales card attempts with AuthoriseInfo.
// Caller must present the service-role key. Nothing here moves money.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { iveriConfigFromEnv } from "../_shared/iveri.ts";
import { sweepOpenAttempts } from "../_shared/stand-sales-service.ts";
import { envGet, json } from "../_shared/stand-sales-http.ts";
import { createSupabaseStore, lakecityTenantId } from "../_shared/stand-sales-store.ts";

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  const serviceKey = envGet("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!bearer || bearer !== serviceKey) return json({ error: "forbidden" }, 403);
  try {
    const config = iveriConfigFromEnv(envGet);
    if ("disabled" in config) return json({ skipped: true, reason: "iveri_off" });
    const db = createClient(envGet("SUPABASE_URL") ?? "", serviceKey);
    const store = createSupabaseStore(db, await lakecityTenantId(db));
    const result = await sweepOpenAttempts({
      store,
      config,
      listOpen: async () => {
        const { data, error } = await db
          .from("stand_sales_payment_attempts")
          .select("*")
          .is("dismissed_at", null)
          .in("status", ["started", "declined", "cancelled", "retry_later", "pending", "error"])
          .or("card_status.is.null,card_status.neq.0");
        if (error) throw new Error("sweep query failed");
        return (data ?? []).map((row: Record<string, unknown>) => ({
          reference: String(row.reference),
          applicationId: String(row.application_id),
          standNumber: String(row.stand_number),
          amountCents: Number(row.amount_cents),
          nonce: String(row.nonce),
          status: row.status,
          cardStatus: row.card_status == null ? null : Number(row.card_status),
          createdAt: String(row.created_at),
          dismissedAt: null,
        }));
      },
    });
    return json(result);
  } catch (error) {
    console.error("[iveri-sweep]", error instanceof Error ? error.message : "unknown");
    return json({ error: "Sweep failed" }, 500);
  }
});
