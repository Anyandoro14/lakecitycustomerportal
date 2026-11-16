// Portal sign-up -> Odoo: make sure the stand has a loan contract built from its
// 36mo/48mo Collection Schedule row (Standledger 19.0.1.2.16,
// POST /lakecity/api/v1/contract/ensure-from-schedule). Create-only and
// idempotent on the Odoo side; Odoo also checks the phone against the sheet.
//
// Secrets (Supabase Vault, same names as odoo-loan-http.ts):
//   odoo_url_<tenantId>            https origin of Odoo
//   odoo_loan_api_token_<tenantId> = Odoo system parameter lakecity_loan.api_token
// No customer message is sent and nothing is written in Supabase here.

export type VaultClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type EnsureContractResult = {
  ok: boolean;
  outcome: string;
  created?: boolean;
  portal_enrolled?: boolean;
  message?: string;
};

type FetchLike = (url: string, init: Record<string, unknown>) => Promise<{ status: number; text: () => Promise<string> }>;

export async function ensureStandContractFromSchedule(
  supabase: VaultClient,
  tenantId: string,
  standNumber: string,
  phoneE164: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs = 20000,
): Promise<EnsureContractResult> {
  const urlKey = `odoo_url_${tenantId}`;
  const tokenKey = `odoo_loan_api_token_${tenantId}`;
  const { data: urlRaw } = await supabase.rpc("vault_read_secret", { secret_name: urlKey });
  const { data: token } = await supabase.rpc("vault_read_secret", { secret_name: tokenKey });
  if (!urlRaw || !token) {
    return { ok: false, outcome: "not_configured", message: `Vault secrets ${urlKey} / ${tokenKey} are not set.` };
  }
  const origin = String(urlRaw).trim().replace(/\/$/, "");
  if (!origin.startsWith("https://")) {
    return { ok: false, outcome: "not_configured", message: `${urlKey} must be an https origin.` };
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetchImpl(`${origin}/lakecity/api/v1/contract/ensure-from-schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ stand_number: standNumber, phone: phoneE164 }),
      signal: controller?.signal,
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return { ok: false, outcome: "bad_response", message: `Odoo returned non-JSON (${res.status}).` };
    }
    if (res.status !== 200) {
      return { ok: false, outcome: "http_error", message: `Odoo returned ${res.status}.` };
    }
    return {
      ok: Boolean(json.ok),
      outcome: String(json.outcome ?? "unknown"),
      created: Boolean(json.created),
      portal_enrolled: Boolean(json.portal_enrolled),
      message: typeof json.message === "string" ? json.message : undefined,
    };
  } catch (err) {
    return { ok: false, outcome: "unreachable", message: String(err).slice(0, 200) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Run the Odoo ensure, then re-check enrolment (Odoo syncs after its commit). */
export async function enrolViaOdooThenRecheck(
  ensure: () => Promise<EnsureContractResult>,
  recheck: () => Promise<boolean>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  retries = 3,
): Promise<{ enrolled: boolean; ensure: EnsureContractResult }> {
  const result = await ensure();
  if (!result.ok || !result.portal_enrolled) return { enrolled: false, ensure: result };
  for (let i = 0; i < retries; i++) {
    if (await recheck()) return { enrolled: true, ensure: result };
    await sleep(1000);
  }
  return { enrolled: false, ensure: result };
}
