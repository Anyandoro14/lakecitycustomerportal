import { describe, expect, it, vi } from "vitest";
import {
  ensureStandContractFromSchedule,
  enrolViaOdooThenRecheck,
} from "../../../supabase/functions/_shared/odoo-ensure-contract.ts";

const TENANT = "00000000-0000-0000-0000-000000000000";
const vault = (values: Record<string, string>) => ({
  rpc: vi.fn(async (_fn: string, args: Record<string, unknown>) => ({
    data: values[String(args.secret_name)] ?? null,
    error: null,
  })),
});
const configured = vault({
  [`odoo_url_${TENANT}`]: "https://odoo.example.test/",
  [`odoo_loan_api_token_${TENANT}`]: "synthetic-token",
});
const reply = (status: number, body: unknown) =>
  vi.fn(async () => ({ status, text: async () => JSON.stringify(body) }));

describe("ensureStandContractFromSchedule", () => {
  it("posts stand + phone with the bearer token", async () => {
    const fetchImpl = reply(200, { ok: true, outcome: "created", created: true, portal_enrolled: true });
    const res = await ensureStandContractFromSchedule(configured, TENANT, "TEST-1", "+263771000001", fetchImpl);
    expect(res).toMatchObject({ ok: true, outcome: "created", created: true, portal_enrolled: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, Record<string, any>];
    expect(url).toBe("https://odoo.example.test/lakecity/api/v1/contract/ensure-from-schedule");
    expect(init.headers.Authorization).toBe("Bearer synthetic-token");
    expect(JSON.parse(init.body)).toEqual({ stand_number: "TEST-1", phone: "+263771000001" });
  });

  it("does nothing when the Vault secrets are missing", async () => {
    const fetchImpl = reply(200, {});
    const res = await ensureStandContractFromSchedule(vault({}), TENANT, "TEST-1", "+263771000001", fetchImpl);
    expect(res.outcome).toBe("not_configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("passes flagged outcomes through without enrolling", async () => {
    const fetchImpl = reply(200, { ok: false, outcome: "flagged_not_on_term_tab" });
    const res = await ensureStandContractFromSchedule(configured, TENANT, "TEST-9", "+263771000001", fetchImpl);
    expect(res).toMatchObject({ ok: false, outcome: "flagged_not_on_term_tab" });
  });

  it("treats HTTP errors and network failures as not enrolled", async () => {
    expect((await ensureStandContractFromSchedule(configured, TENANT, "T", "+1", reply(401, {}))).outcome).toBe("http_error");
    const boom = vi.fn(async () => { throw new Error("down"); });
    expect((await ensureStandContractFromSchedule(configured, TENANT, "T", "+1", boom)).outcome).toBe("unreachable");
  });
});

describe("enrolViaOdooThenRecheck", () => {
  const noSleep = async () => {};
  it("enrols once Odoo has synced the stand", async () => {
    const recheck = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const out = await enrolViaOdooThenRecheck(async () => ({ ok: true, outcome: "created", portal_enrolled: true }), recheck, noSleep);
    expect(out.enrolled).toBe(true);
    expect(recheck).toHaveBeenCalledTimes(2);
  });
  it("never enrols when Odoo flags the stand", async () => {
    const recheck = vi.fn().mockResolvedValue(true);
    const out = await enrolViaOdooThenRecheck(async () => ({ ok: false, outcome: "flagged_phone" }), recheck, noSleep);
    expect(out.enrolled).toBe(false);
    expect(recheck).not.toHaveBeenCalled();
  });
  it("stays not enrolled if the portal row never appears", async () => {
    const out = await enrolViaOdooThenRecheck(async () => ({ ok: true, outcome: "existing_contract", portal_enrolled: true }), async () => false, noSleep, 2);
    expect(out.enrolled).toBe(false);
  });
});
