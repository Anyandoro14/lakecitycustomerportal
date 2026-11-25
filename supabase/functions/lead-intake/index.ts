// Stand page side pane: validates the contact details server-side, creates the lead for the chosen
// stand and returns a per-lead access token. No ID documents are uploaded in the core flow.

import { validateContact } from "../_shared/domain/contact.ts";
import { HttpError, adminClient, json, randomToken, serve, sha256Hex } from "../_shared/server/http.ts";
import { loadStand } from "../_shared/server/leads.ts";

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const body = await req.json().catch(() => ({}));
  const contact = {
    fullName: str(body.contact?.fullName, 200),
    email: str(body.contact?.email, 254).toLowerCase(),
    phone: str(body.contact?.phone, 40),
  };
  const errors = validateContact(contact);
  if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors)[0]!);

  const stand = await loadStand(str(body.standNumber, 10));
  if (stand.status !== "available") throw new HttpError(409, "Sorry, this stand is no longer available.");

  const leadId = crypto.randomUUID();
  const accessToken = randomToken();
  const { error } = await adminClient().from("leads").insert({
    id: leadId,
    access_token_hash: await sha256Hex(accessToken),
    full_name: contact.fullName,
    email: contact.email,
    phone: contact.phone,
    stand_number: stand.standNumber,
  });
  if (error) throw new HttpError(500, "Could not start your application.");
  return json({ leadId, accessToken });
});
