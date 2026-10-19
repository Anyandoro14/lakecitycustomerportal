/**
 * Server-side PostHog capture for Edge Functions.
 * Inert when POSTHOG_PROJECT_KEY is unset.
 * Default host: EU Cloud (https://eu.i.posthog.com).
 *
 * Never send amounts, names, emails, stand numbers, or raw payment refs.
 * Always disable IP / GeoIP on capture payloads.
 */

export const DEFAULT_POSTHOG_HOST = "https://eu.i.posthog.com";

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

export function resolvePostHogHost(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_POSTHOG_HOST;
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
 * Capture one event via PostHog HTTP API. Never throws; no-op without key.
 * Host defaults to EU. Always sets $ip: null and $geoip_disable: true.
 */
export async function captureServerEvent(args: ServerCaptureArgs): Promise<boolean> {
  const key = (Deno.env.get("POSTHOG_PROJECT_KEY") || "").trim();
  if (!key) return false;
  const host = resolvePostHogHost(Deno.env.get("POSTHOG_HOST"));

  const props: Record<string, unknown> = {
    ...(args.properties ?? {}),
    $ip: null,
    $geoip_disable: true,
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

/** Build the property bag used for payment_posted_odoo (testable without Deno fetch). */
export function buildPaymentPostedOdooProperties(source: string, insertId?: string) {
  const props: Record<string, unknown> = {
    source,
    $ip: null,
    $geoip_disable: true,
  };
  if (insertId) props.$insert_id = insertId;
  return props;
}
