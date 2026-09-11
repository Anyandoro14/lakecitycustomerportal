/**
 * Paynow 3rd-party cart integration helpers.
 * @see https://developers.paynow.co.zw/docs/paynow/initiate_transaction/
 * @see https://developers.paynow.co.zw/docs/paynow/generating_hash/
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

export const PAYNOW_INIT_URL = "https://www.paynow.co.zw/interface/initiatetransaction";
export const PAYNOW_MOBILE_URL = "https://www.paynow.co.zw/interface/remotetransaction";

/** Lake City merchant integration (Receive Payment Links). */
export const DEFAULT_PAYNOW_INTEGRATION_ID = "26786";

export type PaynowField = { key: string; value: string };
export type PaynowCredentials = { id: string; key: string };

const PAID_STATUSES = new Set(["paid", "awaiting delivery", "delivered"]);
const FAILED_STATUSES = new Set(["cancelled", "refunded", "failed", "error", "disputed"]);

export function normalizePaynowStatus(status: string): string {
  return (status || "").trim().toLowerCase().replace(/\+/g, " ");
}

export function isPaidPaynowStatus(status: string): boolean {
  return PAID_STATUSES.has(normalizePaynowStatus(status));
}

export function isFailedPaynowStatus(status: string): boolean {
  return FAILED_STATUSES.has(normalizePaynowStatus(status));
}

export function parsePaynowBody(body: string): PaynowField[] {
  if (!body) return [];
  return body.split("&").filter(Boolean).map((pair) => {
    const eq = pair.indexOf("=");
    const key = decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq));
    const raw = eq === -1 ? "" : pair.slice(eq + 1);
    return { key, value: decodeURIComponent(raw.replace(/\+/g, " ")) };
  });
}

export function fieldsToRecord(fields: PaynowField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) out[f.key.toLowerCase()] = f.value;
  return out;
}

export async function sha512HexUpper(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Concatenate field values in message order (skip hash), append integration key, SHA-512 hex upper. */
export async function generatePaynowHash(
  fields: PaynowField[],
  integrationKey: string,
): Promise<string> {
  let concat = "";
  for (const f of fields) {
    if (f.key.toUpperCase() === "HASH") continue;
    concat += f.value ?? "";
  }
  concat += integrationKey;
  return sha512HexUpper(concat);
}

export async function verifyPaynowHash(
  fields: PaynowField[],
  integrationKey: string,
): Promise<boolean> {
  const provided = fields.find((f) => f.key.toUpperCase() === "HASH")?.value || "";
  if (!provided) return false;
  const expected = await generatePaynowHash(fields, integrationKey);
  return expected === provided.toUpperCase();
}

export function encodePaynowBody(fields: PaynowField[]): string {
  return fields
    .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
    .join("&");
}

export async function loadPaynowCredentials(
  supabase: SupabaseClient,
  tenantId?: string | null,
): Promise<PaynowCredentials | null> {
  let id = Deno.env.get("PAYNOW_INTEGRATION_ID") || DEFAULT_PAYNOW_INTEGRATION_ID;
  let key = Deno.env.get("PAYNOW_INTEGRATION_KEY") || "";

  if (tenantId) {
    const { data: vaultId } = await supabase.rpc("vault_read_secret", {
      secret_name: `paynow_integration_id_${tenantId}`,
    });
    const { data: vaultKey } = await supabase.rpc("vault_read_secret", {
      secret_name: `paynow_integration_key_${tenantId}`,
    });
    if (vaultId) id = String(vaultId).trim();
    if (vaultKey) key = String(vaultKey).trim();
  }

  id = (id || "").trim();
  key = (key || "").trim();
  if (!id || !key) return null;
  return { id, key };
}

export type InitiatePaynowInput = {
  credentials: PaynowCredentials;
  reference: string;
  amount: number;
  additionalinfo?: string;
  returnurl: string;
  resulturl: string;
  authemail?: string;
  authphone?: string;
  authname?: string;
  merchanttrace?: string;
  phone?: string;
  method?: "ecocash" | "onemoney";
};

export async function initiatePaynowTransaction(
  input: InitiatePaynowInput,
): Promise<{ ok: true; browserurl: string; pollurl: string; raw: Record<string, string> } | { ok: false; error: string }> {
  const amount = Number(input.amount).toFixed(2);
  const fields: PaynowField[] = [
    { key: "id", value: input.credentials.id },
    { key: "reference", value: input.reference },
    { key: "amount", value: amount },
  ];
  if (input.additionalinfo) fields.push({ key: "additionalinfo", value: input.additionalinfo });
  fields.push({ key: "returnurl", value: input.returnurl });
  fields.push({ key: "resulturl", value: input.resulturl });
  if (input.authemail) fields.push({ key: "authemail", value: input.authemail });
  if (input.authphone) fields.push({ key: "authphone", value: input.authphone });
  if (input.authname) fields.push({ key: "authname", value: input.authname });
  if (input.merchanttrace) fields.push({ key: "merchanttrace", value: input.merchanttrace });
  if (input.phone) fields.push({ key: "phone", value: input.phone });
  if (input.method) fields.push({ key: "method", value: input.method });
  fields.push({ key: "status", value: "Message" });

  const hash = await generatePaynowHash(fields, input.credentials.key);
  fields.push({ key: "hash", value: hash });

  const url = input.method ? PAYNOW_MOBILE_URL : PAYNOW_INIT_URL;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodePaynowBody(fields),
  });

  const text = await res.text();
  const parsed = parsePaynowBody(text);
  const rec = fieldsToRecord(parsed);
  const status = rec.status || "";

  if (normalizePaynowStatus(status) === "error" || !res.ok) {
    return { ok: false, error: rec.error || `Paynow initiate failed (${res.status})` };
  }

  if (parsed.some((f) => f.key.toUpperCase() === "HASH")) {
    const valid = await verifyPaynowHash(parsed, input.credentials.key);
    if (!valid) return { ok: false, error: "Paynow returned an invalid hash" };
  }

  if (normalizePaynowStatus(status) !== "ok" || !rec.pollurl) {
    return { ok: false, error: rec.error || "Unexpected Paynow initiate response" };
  }

  return {
    ok: true,
    browserurl: rec.browserurl || "",
    pollurl: rec.pollurl,
    raw: rec,
  };
}

export async function pollPaynowStatus(
  pollurl: string,
  integrationKey: string,
): Promise<{ ok: true; fields: Record<string, string> } | { ok: false; error: string }> {
  const res = await fetch(pollurl, { method: "GET" });
  const text = await res.text();
  const parsed = parsePaynowBody(text);
  if (!parsed.length) return { ok: false, error: "Empty Paynow poll response" };

  if (parsed.some((f) => f.key.toUpperCase() === "HASH")) {
    const valid = await verifyPaynowHash(parsed, integrationKey);
    if (!valid) return { ok: false, error: "Paynow poll hash invalid" };
  }

  return { ok: true, fields: fieldsToRecord(parsed) };
}

export function mapPaynowChannelToMethod(channel?: string): string {
  const c = (channel || "").toLowerCase();
  if (c.includes("eco")) return "ecocash";
  if (c.includes("one")) return "onemoney";
  if (c.includes("innbuck")) return "innbucks";
  if (c.includes("zimswitch") || c.includes("vpayment")) return "zimswitch";
  if (c.includes("visa") || c.includes("master") || c.includes("card")) return "card";
  if (c.includes("bank") || c.includes("transfer")) return "bank_transfer";
  return channel || "paynow";
}

export function normalizeZwMobile(phone: string): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;
  let local = digits;
  if (local.startsWith("263")) local = `0${local.slice(3)}`;
  if (local.length === 9 && local.startsWith("7")) local = `0${local}`;
  if (!/^0(7[1-8]|86)\d{7}$/.test(local)) return null;
  return local;
}

export function formatPaynowAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function buildMerchantReference(standNumber: string): string {
  const stand = (standNumber || "STAND").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16).toUpperCase();
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `SL-${stand}-${stamp}-${rand}`.slice(0, 40);
}
