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

/**
 * Paynow has blocked some shared egress IPs. If PAYNOW_PROXY_URL is set, the
 * request is relayed through it; otherwise Paynow is called directly.
 */
export class PaynowUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaynowUnreachableError";
  }
}

const PAYNOW_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "Accept": "*/*",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Connection": "close",
} as const;

function altHost(url: string): string | null {
  if (url.includes("://www.paynow.co.zw")) return url.replace("://www.paynow.co.zw", "://paynow.co.zw");
  if (url.includes("://paynow.co.zw")) return url.replace("://paynow.co.zw", "://www.paynow.co.zw");
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Paynow resets connections from some shared egress IPs. If PAYNOW_PROXY_URL is
 * set, the request is relayed through it; otherwise Paynow is called directly
 * with retries across both hostnames.
 */
export async function paynowFetch(targetUrl: string, body: string): Promise<Response> {
  const proxy = Deno.env.get("PAYNOW_PROXY_URL");
  const proxySecret = Deno.env.get("PAYNOW_PROXY_SECRET");
  if (proxy) {
    try {
      const res = await fetch(proxy, {
        method: "POST",
        headers: {
          ...PAYNOW_HEADERS,
          "X-Paynow-Target": targetUrl,
          ...(proxySecret ? { "X-Relay-Secret": proxySecret } : {}),
        },
        body,
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return res;
      console.error("Paynow proxy returned", res.status, await res.clone().text());
    } catch (e) {
      console.error("Paynow proxy failed, falling back to direct call:", e);
    }
  }

  const urls = [targetUrl, altHost(targetUrl)].filter(Boolean) as string[];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: PAYNOW_HEADERS,
          body,
          redirect: "follow",
          signal: AbortSignal.timeout(20000),
        });
        return res;
      } catch (e) {
        lastError = e;
        console.error(`Paynow request failed (attempt ${attempt + 1}, ${url}):`, e);
      }
    }
    await sleep(400 * (attempt + 1));
  }

  throw new PaynowUnreachableError(
    `Could not reach Paynow: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
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

  const res = await paynowFetch(mobile ? PAYNOW_REMOTE_URL : PAYNOW_INITIATE_URL, encodeForm(fields));

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
  const res = await paynowFetch(pollUrl, "");
  const parsed = parsePaynowResponse(await res.text());

  if (parsed.hash && !(await verifyHash(parsed, key))) {
    throw new Error("Paynow poll response failed hash verification");
  }
  return parsed;
}
