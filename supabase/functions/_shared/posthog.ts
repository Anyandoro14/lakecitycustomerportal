/**
 * Server-side PostHog capture for Edge Functions.
 * Inert when POSTHOG_PROJECT_KEY or POSTHOG_HOST is unset.
 *
 * Never send amounts, names, emails, stand numbers, or raw payment refs.
 */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

/**
 * Same salt as the browser (`VITE_TELEMETRY_SALT`), set as Edge secret
 * `TELEMETRY_SALT` so distinct_ids align across client and server.
 */
export async function hashUserIdForTelemetry(
  internalUserId: string | null | undefined,
  salt: string | null | undefined = Deno.env.get("TELEMETRY_SALT"),
): Promise<string | null> {
  const id = (internalUserId ?? "").trim();
  const s = (salt ?? "").trim();
  if (!id || !s) return null;
  return sha256Hex(`${id}${s}`);
}

/** Hash an Odoo payment id for PostHog `$insert_id` dedupe (never the raw id). */
export async function hashOdooPaymentIdForDedupe(
  odooPaymentId: string | number,
  salt: string | null | undefined = Deno.env.get("TELEMETRY_SALT"),
): Promise<string | null> {
  const s = (salt ?? "").trim();
  const raw = String(odooPaymentId ?? "").trim();
  if (!raw || !s) return null;
  return sha256Hex(`odoo_payment:${raw}:${s}`);
}

export type ServerCaptureArgs = {
  event: string;
  distinctId: string;
  properties?: Record<string, unknown>;
  /** PostHog insert id for dedupe (already hashed). */
  insertId?: string;
};

/**
 * Capture one event via PostHog HTTP API. Never throws; no-op without env.
 */
export async function captureServerEvent(args: ServerCaptureArgs): Promise<boolean> {
  const key = (Deno.env.get("POSTHOG_PROJECT_KEY") || "").trim();
  const host = (Deno.env.get("POSTHOG_HOST") || "").trim().replace(/\/+$/, "");
  if (!key || !host) return false;

  const props: Record<string, unknown> = {
    ...(args.properties ?? {}),
  };
  if (args.insertId) props.$insert_id = args.insertId;

  const url = `${host}/capture/`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event: args.event,
        distinct_id: args.distinctId,
        properties: props,
      }),
      signal: controller.signal,
    }).catch(() => undefined);
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

/**
 * North Star: payment posted in Odoo for a hashed customer.
 * Call only after a successful posted sync. Skips if env / customer missing.
 */
export async function trackPaymentPostedOdoo(opts: {
  internalUserId: string | null | undefined;
  odooPaymentId: string | number;
  source: string;
}): Promise<void> {
  const distinctId = await hashUserIdForTelemetry(opts.internalUserId);
  if (!distinctId) return;
  const insertId = await hashOdooPaymentIdForDedupe(opts.odooPaymentId);
  await captureServerEvent({
    event: "payment_posted_odoo",
    distinctId,
    insertId: insertId ?? undefined,
    properties: {
      source: opts.source,
    },
  });
}
