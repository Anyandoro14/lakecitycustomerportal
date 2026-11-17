// Every 15 min (pg_cron): settle orders with no return via AuthoriseInfo, abandon stale ones,
// retry Odoo Staging intakes. Service-role bearer only.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sweep, redact } from "../_shared/iveri.ts";
import { iveriDeps } from "../_shared/iveri-deps.ts";

serve(async (req) => {
  const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!bearer || bearer !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return new Response("forbidden", { status: 403 });
  const { deps, cfg } = iveriDeps();
  try {
    const r = await sweep(deps, 15);
    return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: redact(cfg, String(e)) }), { status: 500 });
  }
});
