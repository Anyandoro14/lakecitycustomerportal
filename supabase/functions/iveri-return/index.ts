// iVeri posts the browser here on all 4 URLs: /iveri-return/{success|fail|trylater|error}.
// verify_jwt = false (iVeri cannot send a JWT). Truth comes from AuthoriseInfo, not this POST.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleReturn, redact } from "../_shared/iveri.ts";
import { iveriDeps } from "../_shared/iveri-deps.ts";

serve(async (req) => {
  const { deps, cfg } = iveriDeps();
  const path = new URL(req.url).pathname.split("/").pop() || "error";
  const to = (page: string, ref = "") => new Response(null, { status: 303, headers: { Location: `${cfg.portalBaseUrl}/pay/card/${page}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}` } });
  if (req.method !== "POST" || !["success", "fail", "trylater", "error"].includes(path)) return to("error");
  try {
    const form = Object.fromEntries(new URLSearchParams(await req.text()));
    const r = await handleReturn(deps, path, form);
    console.log(`iveri-return ${path} -> ${r.page} ${r.reference ?? "-"} ${r.state} recorded=${r.recorded}${r.note ? ` (${r.note})` : ""}`);
    return to(r.page, r.reference ?? "");
  } catch (e) {
    console.error("iveri-return failed:", redact(cfg, String(e)));
    return to("trylater");
  }
});
