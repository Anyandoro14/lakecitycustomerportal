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
  payment_id: number | null;
  payment_name?: string;
  skipped?: boolean;
  reason?: string;
  accounting_start_date?: string;
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

  if (json.skipped) {
    return {
      payment_id: (json.payment_id as number | undefined) ?? null,
      payment_name: json.payment_name as string | undefined,
      skipped: true,
      reason: (json.reason as string | undefined) || "skipped",
      accounting_start_date: json.accounting_start_date as string | undefined,
      contract: json.contract as Record<string, unknown> | undefined,
    };
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

export type LakecityLoanListContract = {
  id: number;
  name?: string;
  external_uid?: string;
  stand_number: string;
  partner_name?: string;
  partner_email?: string;
  state?: string;
  total_price: number;
  total_with_tax: number;
  deposit_amount: number;
  total_paid: number;
  current_balance: number;
  partner_credit?: number;
  lakecity_portal_enrolled?: boolean;
};

/**
 * Vault `odoo_url_<tenantId>` + `odoo_loan_api_token_<tenantId>`,
 * with env fallbacks `ODOO_ORIGIN` / `LAKECITY_LOAN_API_TOKEN`.
 */
export async function getLakecityLoanApi(
  tenantId: string,
  supabase: SupabaseClient,
): Promise<{ origin: string; token: string }> {
  const urlKey = `odoo_url_${tenantId}`;
  const tokenKey = `odoo_loan_api_token_${tenantId}`;

  const { data: odooUrlRaw } = await supabase.rpc("vault_read_secret", { secret_name: urlKey });
  const { data: apiToken } = await supabase.rpc("vault_read_secret", { secret_name: tokenKey });

  const originRaw = (odooUrlRaw && String(odooUrlRaw).trim()) || (Deno.env.get("ODOO_ORIGIN") || "").trim();
  const token = (apiToken && String(apiToken).trim()) || (Deno.env.get("LAKECITY_LOAN_API_TOKEN") || "").trim();

  if (!originRaw || !token) {
    throw new Error(
      `Missing Lakecity Loan API credentials (${urlKey} / ${tokenKey} in Vault, or ODOO_ORIGIN / LAKECITY_LOAN_API_TOKEN).`,
    );
  }
  if (!originRaw.startsWith("http")) {
    throw new Error(`Invalid Odoo origin: must be https`);
  }
  return { origin: originRaw.replace(/\/$/, ""), token };
}

export async function lakecityListLoans(
  origin: string,
  token: string,
  options: { limit?: number; offset?: number; state?: string } = {},
): Promise<{ ok: boolean; contracts: LakecityLoanListContract[]; count: number; error?: string }> {
  const params = new URLSearchParams();
  if (options.limit != null) params.set("limit", String(options.limit));
  if (options.offset != null) params.set("offset", String(options.offset));
  if (options.state) params.set("state", options.state);
  const qs = params.toString();
  const url = `${origin}/lakecity/api/v1/loan/list${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Lakecity loan/list: non-JSON response (${res.status}) ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.ok === false) {
    const err = (json.error as string) || text || res.statusText;
    throw new Error(`Lakecity loan/list failed (${res.status}): ${err}`);
  }
  return {
    ok: true,
    contracts: (json.contracts as LakecityLoanListContract[]) || [],
    count: Number(json.count) || 0,
  };
}
