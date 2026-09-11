// Shared Paynow (Zimbabwe) helpers.
// Credentials are read from Cloud secrets — never expose these to the frontend.

export const PAYNOW_INITIATE_URL = "https://www.paynow.co.zw/interface/initiatetransaction";
export const PAYNOW_REMOTE_URL = "https://www.paynow.co.zw/interface/remotetransaction";

/** Paynow statuses that mean the money is ours. */
export const PAID_STATUSES = ["paid", "awaiting delivery", "delivered"];

export function isPaidStatus(status: string | undefined | null): boolean {
  return PAID_STATUSES.includes((status || "").trim().toLowerCase());
}

export function getPaynowCredentials(): { id: string; key: string } {
  const id = Deno.env.get("PAYNOW_INTEGRATION_ID");
  const key = Deno.env.get("PAYNOW_INTEGRATION_KEY");
  if (!id || !key) throw new Error("Paynow credentials are not configured");
  return { id, key };
}

/**
 * Paynow hash: concatenate all field values (in order, excluding `hash`),
 * append the integration key, SHA-512, uppercase hex.
 */
export async function generateHash(
  values: Record<string, string>,
  integrationKey: string,
): Promise<string> {
  let concat = "";
  for (const [k, v] of Object.entries(values)) {
    if (k.toLowerCase() === "hash") continue;
    concat += v ?? "";
  }
  concat += integrationKey;

  const digest = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(concat));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function verifyHash(
  values: Record<string, string>,
  integrationKey: string,
): Promise<boolean> {
  const provided = (values.hash || values.Hash || "").toUpperCase();
  if (!provided) return false;
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (k.toLowerCase() === "hash") continue;
    clean[k] = v;
  }
  const expected = await generateHash(clean, integrationKey);
  return expected === provided;
}

/** Paynow speaks urlencoded key=value bodies in both directions. */
export function parsePaynowResponse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of text.split("&")) {
    if (!pair) continue;
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = decodeURIComponent(pair.slice(0, idx).replace(/\+/g, " ")).trim();
    const v = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, " "));
    out[k.toLowerCase()] = v;
  }
  return out;
}

export function encodeForm(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? "")}`)
    .join("&");
}

export interface InitiateArgs {
  reference: string;
  amount: number;
  additionalinfo: string;
  returnurl: string;
  resulturl: string;
  authemail: string;
  /** Mobile money express checkout */
  method?: "ecocash" | "onemoney" | "innbucks";
  phone?: string;
}

export interface InitiateResult {
  ok: boolean;
  error?: string;
  redirectUrl?: string;
  pollUrl?: string;
  instructions?: string;
  raw: Record<string, string>;
}

export async function initiateTransaction(args: InitiateArgs): Promise<InitiateResult> {
  const { id, key } = getPaynowCredentials();

  const fields: Record<string, string> = {
    id,
    reference: args.reference,
    amount: args.amount.toFixed(2),
    additionalinfo: args.additionalinfo,
    returnurl: args.returnurl,
    resulturl: args.resulturl,
    authemail: args.authemail,
    status: "Message",
  };

  const mobile = !!(args.method && args.phone);
  if (mobile) {
    fields.method = args.method!;
    fields.phone = args.phone!;
  }

  fields.hash = await generateHash(fields, key);

  const res = await fetch(mobile ? PAYNOW_REMOTE_URL : PAYNOW_INITIATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeForm(fields),
  });

  const text = await res.text();
  const parsed = parsePaynowResponse(text);

  if ((parsed.status || "").toLowerCase() !== "ok") {
    return { ok: false, error: parsed.error || "Paynow rejected the request", raw: parsed };
  }

  return {
    ok: true,
    redirectUrl: parsed.browserurl,
    pollUrl: parsed.pollurl,
    instructions: parsed.instructions,
    raw: parsed,
  };
}

/** Poll a Paynow poll URL and return the parsed, hash-verified status payload. */
export async function pollTransaction(pollUrl: string): Promise<Record<string, string>> {
  const { key } = getPaynowCredentials();
  const res = await fetch(pollUrl, { method: "POST" });
  const parsed = parsePaynowResponse(await res.text());

  if (parsed.hash && !(await verifyHash(parsed, key))) {
    throw new Error("Paynow poll response failed hash verification");
  }
  return parsed;
}
