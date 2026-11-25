// iVeri Lite return / notify handler. iVeri sends the browser here (success, fail, try-later or error URL)
// with our merchant trace in the query string. Nothing iVeri posts is trusted: the result is read from
// AuthoriseInfo server-side, and only card status 0 applies the payment. Safe to hit repeatedly.

import { env } from "../_shared/server/http.ts";
import { iveriConfig, iveriDeps, processIveriReturn } from "../_shared/server/payment.ts";

const appUrl = () => (env("APP_URL") || "http://127.0.0.1:8137").replace(/\/$/, "");

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const url = new URL(req.url);
  const reference = (url.searchParams.get("trace") ?? "").slice(0, 20);
  const kind = (url.searchParams.get("kind") ?? "").replace(/[^a-z]/g, "").slice(0, 10);
  let target = `${appUrl()}/?payment=not-found`;
  try {
    const outcome = await processIveriReturn(iveriDeps(iveriConfig()), { reference, kind });
    if (outcome.leadId) {
      target = `${appUrl()}/apply/${outcome.leadId}/payment?ref=${encodeURIComponent(reference)}&kind=${encodeURIComponent(kind)}`;
    }
  } catch (e) {
    console.error("[iveri-return] failed:", e instanceof Error ? e.message : "unknown");
    target = `${appUrl()}/?payment=check-later`;
  }
  return new Response(null, { status: 303, headers: { Location: target } });
});
