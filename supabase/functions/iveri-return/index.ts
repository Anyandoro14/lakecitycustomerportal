// iVeri sends the browser here. verify_jwt is false because iVeri cannot send a Supabase JWT.
// Posted fields are not trusted: AuthoriseInfo is read server-side.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { iveriConfigFromEnv } from "../_shared/iveri.ts";
import { handleGatewayReturn } from "../_shared/stand-sales-service.ts";
import { envGet } from "../_shared/stand-sales-http.ts";
import { createSupabaseStore, lakecityTenantId } from "../_shared/stand-sales-store.ts";

function appUrl() {
  return (envGet("APP_URL") || "http://127.0.0.1:8080").replace(/\/$/, "");
}

serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const url = new URL(req.url);
  const reference = (url.searchParams.get("trace") ?? "").slice(0, 20);
  const kind = (url.searchParams.get("kind") ?? "").replace(/[^a-z]/g, "").slice(0, 10);
  let target = `${appUrl()}/stands/pay/result?payment=not-found`;
  try {
    const config = iveriConfigFromEnv(envGet);
    if ("disabled" in config) {
      target = `${appUrl()}/stands/pay/result?payment=unavailable`;
    } else if (reference) {
      const db = createClient(envGet("SUPABASE_URL") ?? "", envGet("SUPABASE_SERVICE_ROLE_KEY") ?? "");
      const store = createSupabaseStore(db, await lakecityTenantId(db));
      const outcome = await handleGatewayReturn({ store, config, reference, kind });
      const stand = outcome?.applicationId ? (await store.getAttempt(reference))?.standNumber : "";
      target = `${appUrl()}/stands/pay/result?ref=${encodeURIComponent(reference)}&kind=${encodeURIComponent(kind)}${stand ? `&stand=${encodeURIComponent(stand)}` : ""}`;
    }
  } catch (error) {
    console.error("[iveri-return]", error instanceof Error ? error.message : "unknown");
    target = `${appUrl()}/stands/pay/result?payment=check-later`;
  }
  return new Response(null, { status: 303, headers: { Location: target } });
});
