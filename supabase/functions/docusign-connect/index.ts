// DocuSign Connect webhook (JSON, SIM mode). On envelope-completed the stand is ALLOCATED (signed)
// and the lead moves to the signed list. HMAC verification is mandatory when a key is configured.
// https://developers.docusign.com/platform/webhooks/connect/hmac/

import { queueEmail } from "../_shared/server/email.ts";
import { HttpError, adminClient, env, json, serve, timingSafeEqual } from "../_shared/server/http.ts";
import { loadLead, loadStand } from "../_shared/server/leads.ts";

async function hmacBase64(key: string, body: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body)));
  return btoa(String.fromCharCode(...sig));
}

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const raw = await req.text();

  const key = env("DOCUSIGN_CONNECT_HMAC_KEY");
  if (!key) throw new HttpError(503, "Connect HMAC key not configured.");
  const expected = await hmacBase64(key, raw);
  const provided = [1, 2, 3, 4, 5].map((i) => req.headers.get(`x-docusign-signature-${i}`)).filter(Boolean) as string[];
  if (!provided.some((p) => timingSafeEqual(p, expected))) throw new HttpError(401, "Invalid signature.");

  const evt = JSON.parse(raw);
  const envelopeId: string | undefined = evt?.data?.envelopeId;
  const event: string = evt?.event ?? "unknown";
  if (!envelopeId) throw new HttpError(400, "No envelopeId.");

  const db = adminClient();
  await db.from("docusign_events").insert({ envelope_id: envelopeId, event });

  if (event === "envelope-completed") {
    const { data: leadId, error } = await db.rpc("mark_signed", { p_envelope_id: envelopeId });
    if (error) throw new HttpError(409, error.message);
    if (leadId) {
      const lead = await loadLead(leadId);
      const { count } = await db.from("email_outbox").select("id", { count: "exact", head: true }).eq("lead_id", leadId).eq("template", "agreement_signed");
      if (!count) {
        const stand = await loadStand(lead.standNumber);
        await queueEmail("agreement_signed", lead, stand);
        await queueEmail("portal_created", lead, stand);
      }
    }
  }
  return json({ ok: true });
});
