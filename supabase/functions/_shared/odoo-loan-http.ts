import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

export type LakecityPostPaymentPayload = {
  external_uid: string;
  contract_external_uid: string;
  amount: number;
  payment_date: string;
  source: string;
  reference?: string | null;
  note?: string | null;
  state?: string;
};

export type LakecityPostPaymentResult = {
  payment_id: number;
  payment_name?: string;
  contract?: Record<string, unknown>;
};

/**
 * Reads `odoo_url_<tenantId>` and `odoo_loan_api_token_<tenantId>` from Vault
 * and POSTs to Lakecity Loan HTTP API (BNPL ledger), idempotent on `external_uid`.
 */
export async function lakecityPostLoanPayment(
  tenantId: string,
  payload: LakecityPostPaymentPayload,
  supabase: SupabaseClient,
): Promise<LakecityPostPaymentResult> {
  const urlKey = `odoo_url_${tenantId}`;
  const tokenKey = `odoo_loan_api_token_${tenantId}`;

  const { data: odooUrlRaw, error: urlErr } = await supabase.rpc("vault_read_secret", {
    secret_name: urlKey,
  });
  const { data: apiToken, error: tokErr } = await supabase.rpc("vault_read_secret", {
    secret_name: tokenKey,
  });

  if (urlErr || tokErr || !odooUrlRaw || !apiToken) {
    throw new Error(
      `Missing Lakecity Loan API Vault secrets (${urlKey} / ${tokenKey}). See odoo/addons/lakecity_loan_management/ODOO_SH.md`,
    );
  }

  let origin = String(odooUrlRaw).trim();
  if (!origin.startsWith("http")) {
    throw new Error(`Invalid ${urlKey}: must be https origin`);
  }
  origin = origin.replace(/\/$/, "");

  const res = await fetch(`${origin}/lakecity/api/v1/payment/post`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      external_uid: payload.external_uid,
      contract_external_uid: payload.contract_external_uid,
      amount: payload.amount,
      payment_date: payload.payment_date,
      source: payload.source,
      reference: payload.reference ?? undefined,
      note: payload.note ?? undefined,
      state: payload.state ?? "posted",
    }),
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Lakecity payment/post: non-JSON response (${res.status}) ${text.slice(0, 200)}`);
  }

  if (!res.ok || json.ok === false) {
    const err = (json.error as string) || text || res.statusText;
    throw new Error(`Lakecity payment/post failed (${res.status}): ${err}`);
  }

  const paymentId = json.payment_id as number | undefined;
  if (paymentId == null || typeof paymentId !== "number") {
    throw new Error("Lakecity payment/post: missing payment_id in response");
  }

  return {
    payment_id: paymentId,
    payment_name: json.payment_name as string | undefined,
    contract: json.contract as Record<string, unknown> | undefined,
  };
}

export function getSupabaseServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseServiceKey);
}
