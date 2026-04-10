import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

export type NormalizedPaymentEvent = {
  tenantId: string;
  providerCode: "kuva" | "paystack" | "paypal" | "flutterwave" | "manual" | "odoo";
  providerEventId: string;
  providerReference?: string | null;
  standNumber?: string | null;
  amount: number;
  currency: string;
  state: "initialized" | "authorized" | "captured" | "settled" | "failed" | "reversed";
  occurredAt?: string;
  metadata?: Record<string, unknown>;
  signatureVerified: boolean;
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature, paypal-transmission-id, paypal-cert-url, paypal-auth-algo, paypal-transmission-sig, paypal-transmission-time, flutterwave-signature",
};

export function parseMoney(value: unknown): number {
  if (typeof value === "number" && !isNaN(value)) return value;
  const cleaned = (value ?? "").toString().replace(/[,\s$]/g, "");
  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}

export async function verifyHmacHex(
  payload: string,
  signatureHex: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expected = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return expected === signatureHex.toLowerCase();
}

export async function getTenantSecret(
  supabaseUrl: string,
  serviceRoleKey: string,
  tenantId: string,
  secretKeyName: string,
  fallbackEnv?: string,
): Promise<string> {
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: secret } = await admin.rpc("vault_read_secret", {
    secret_name: `${secretKeyName}_${tenantId}`,
  });
  if (typeof secret === "string" && secret.length > 0) return secret;
  return fallbackEnv ? Deno.env.get(fallbackEnv) || "" : "";
}
