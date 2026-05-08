import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readVaultSecret(secretName: string): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase.rpc("vault_read_secret", { secret_name: secretName });
  if (error || !data) {
    throw new Error(`Missing Vault secret: ${secretName}`);
  }
  return data as string;
}

export async function getOdooLoanApiConfig(tenantId: string): Promise<{ baseUrl: string; token: string }> {
  const baseUrl = await readVaultSecret(`odoo_url_${tenantId}`);
  const token = await readVaultSecret(`odoo_loan_api_token_${tenantId}`);
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token,
  };
}

export async function callOdooLoanApi(
  tenantId: string,
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const cfg = await getOdooLoanApiConfig(tenantId);
  const url = `${cfg.baseUrl}${path}`;
  const maxAttempts = 4;

  let lastError = "unknown";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cfg.token}`,
        },
        body: method === "POST" ? JSON.stringify(body || {}) : undefined,
      });

      const text = await response.text();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { raw: text };
      }

      if (response.ok) return parsed;
      lastError = `${response.status} ${JSON.stringify(parsed)}`;
      if (!RETRYABLE.has(response.status) || attempt === maxAttempts) {
        throw new Error(`Odoo Loan API error: ${lastError}`);
      }
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt === maxAttempts) {
        throw new Error(`Odoo Loan API call failed after retries: ${lastError}`);
      }
    }
    await sleep(250 * attempt * attempt);
  }

  throw new Error(`Odoo Loan API call failed: ${lastError}`);
}
