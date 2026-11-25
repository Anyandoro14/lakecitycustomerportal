// Step 1: intake + ID upload. Validates everything server-side, stores ID images in the PRIVATE
// id-documents bucket, creates the lead (status id_pending_review) and returns a per-lead access token.

import { validateIdentity, type IdType } from "../_shared/domain/id-validation.ts";
import { isIsoCountry } from "../_shared/domain/countries.ts";
import { MAX_CO_OWNERS } from "../_shared/domain/types.ts";
import { ID_UPLOAD_EXTENSION, checkIdUploadMeta, sniffIdUploadMime } from "../_shared/domain/uploads.ts";
import { queueEmail } from "../_shared/server/email.ts";
import { HttpError, adminClient, json, randomToken, serve, sha256Hex } from "../_shared/server/http.ts";
import { loadLead, loadStand } from "../_shared/server/leads.ts";

interface PersonPayload {
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  idType: IdType;
  idIssuingCountry: string;
  idNumber: string;
  idExpiry: string | null;
}
interface Payload {
  buyer: PersonPayload & { physicalAddress: string; postalAddress: string; country: string };
  coOwners: PersonPayload[];
  standNumber: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function checkPerson(p: PersonPayload, label: string) {
  if (str(p.fullName).length < 3) throw new HttpError(400, `${label}: full name is required.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(p.dateOfBirth))) throw new HttpError(400, `${label}: date of birth is required.`);
  if (!EMAIL.test(str(p.email))) throw new HttpError(400, `${label}: a valid email is required.`);
  if (str(p.phone).replace(/\D/g, "").length < 7) throw new HttpError(400, `${label}: a valid phone number is required.`);
  const v = validateIdentity({ idType: p.idType, issuingCountry: p.idIssuingCountry, idNumber: p.idNumber, expiryDate: p.idExpiry });
  if (!v.ok) throw new HttpError(400, `${label}: ${Object.values(v.errors)[0]}`);
  return v.normalized;
}

async function checkFile(f: FormDataEntryValue | null, label: string, required: boolean): Promise<File | null> {
  if (!f) {
    if (required) throw new HttpError(400, `${label} is required.`);
    return null;
  }
  if (!(f instanceof File)) throw new HttpError(400, `${label} is invalid.`);
  const meta = checkIdUploadMeta(f);
  if (meta) throw new HttpError(400, `${label}: ${meta}`);
  const sniffed = sniffIdUploadMime(new Uint8Array(await f.slice(0, 16).arrayBuffer()));
  if (sniffed !== f.type) throw new HttpError(400, `${label}: file content does not match its type.`);
  return f;
}

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const form = await req.formData();
  let payload: Payload;
  try {
    payload = JSON.parse(String(form.get("payload")));
  } catch {
    throw new HttpError(400, "Invalid payload.");
  }

  const coOwners = Array.isArray(payload.coOwners) ? payload.coOwners : [];
  if (coOwners.length > MAX_CO_OWNERS) throw new HttpError(400, `At most ${MAX_CO_OWNERS} co-owners.`);
  const buyerId = checkPerson(payload.buyer, "Buyer");
  const coOwnerIds = coOwners.map((c, i) => checkPerson(c, `Co-owner ${i + 1}`));
  if (str(payload.buyer.physicalAddress).length < 5 || str(payload.buyer.postalAddress).length < 5) {
    throw new HttpError(400, "Residential and postal addresses are required.");
  }
  if (!isIsoCountry(payload.buyer.country)) throw new HttpError(400, "Country of residence is required.");

  const stand = await loadStand(str(payload.standNumber, 10));
  if (stand.status !== "available") throw new HttpError(409, "Sorry, this stand is no longer available.");

  const files = {
    buyer: {
      front: await checkFile(form.get("buyer_front"), "Buyer ID photo", true),
      back: await checkFile(form.get("buyer_back"), "Buyer ID back", false),
    },
    coOwners: await Promise.all(
      coOwners.map(async (_, i) => ({
        front: await checkFile(form.get(`coowner${i + 1}_front`), `Co-owner ${i + 1} ID photo`, true),
        back: await checkFile(form.get(`coowner${i + 1}_back`), `Co-owner ${i + 1} ID back`, false),
      })),
    ),
  };

  const db = adminClient();
  const leadId = crypto.randomUUID();
  const accessToken = randomToken();

  // Upload to the PRIVATE bucket. Paths are opaque; no public URLs are ever generated.
  const upload = async (who: string, side: string, f: File | null) => {
    if (!f) return null;
    const path = `${leadId}/${who}-${side}-${crypto.randomUUID()}.${ID_UPLOAD_EXTENSION[f.type as keyof typeof ID_UPLOAD_EXTENSION]}`;
    const { error } = await db.storage.from("id-documents").upload(path, f, { contentType: f.type, upsert: false });
    if (error) throw new HttpError(500, "Could not store your ID document. Please try again.");
    return path;
  };

  const buyerFront = await upload("buyer", "front", files.buyer.front);
  const buyerBack = await upload("buyer", "back", files.buyer.back);
  const b = payload.buyer;
  const { error: leadErr } = await db.from("leads").insert({
    id: leadId,
    access_token_hash: await sha256Hex(accessToken),
    full_name: str(b.fullName, 200),
    date_of_birth: b.dateOfBirth,
    email: str(b.email, 254).toLowerCase(),
    phone: str(b.phone, 40),
    physical_address: str(b.physicalAddress),
    postal_address: str(b.postalAddress),
    country: b.country.toUpperCase(),
    id_type: b.idType,
    id_issuing_country: b.idIssuingCountry.toUpperCase(),
    id_number: buyerId,
    id_expiry: b.idExpiry || null,
    id_front_path: buyerFront,
    id_back_path: buyerBack,
    stand_number: stand.standNumber,
  });
  if (leadErr) throw new HttpError(500, "Could not save your application.");

  for (const [i, c] of coOwners.entries()) {
    const { error } = await db.from("co_owners").insert({
      lead_id: leadId,
      position: i + 1,
      full_name: str(c.fullName, 200),
      date_of_birth: c.dateOfBirth,
      email: str(c.email, 254).toLowerCase(),
      phone: str(c.phone, 40),
      id_type: c.idType,
      id_issuing_country: c.idIssuingCountry.toUpperCase(),
      id_number: coOwnerIds[i],
      id_expiry: c.idExpiry || null,
      id_front_path: await upload(`coowner${i + 1}`, "front", files.coOwners[i].front),
      id_back_path: await upload(`coowner${i + 1}`, "back", files.coOwners[i].back),
    });
    if (error) throw new HttpError(500, "Could not save co-owner details.");
  }

  await queueEmail("intake_submitted", await loadLead(leadId), stand);
  return json({ leadId, accessToken });
});
