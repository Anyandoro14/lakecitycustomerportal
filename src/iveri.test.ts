import { describe, expect, it } from "vitest";
import {
  buildLiteForm,
  classifyCardStatus,
  isSettled,
  iveriConfigFromEnv,
  newMerchantReference,
  parseAuthoriseInfo,
  processIveriReturn,
  standFromReference,
  storedResult,
  type ApplyStatus,
  type AuthoriseInfo,
  type IveriConfig,
  type IveriReturnDeps,
  type PaymentAttempt,
} from "@shared/domain/iveri.ts";
import { handlePaymentConfirmed } from "@shared/domain/payment-events.ts";
import type { Lead, Stand } from "@shared/domain/types.ts";

const APP_ID = "0a1b2c3d-1111-2222-3333-444455556666";
const config: IveriConfig = {
  environment: "test",
  applicationId: APP_ID,
  sharedSecret: null,
  gatewayUrl: "https://portal.host.iveri.com/Lite/Authorise.aspx",
  authoriseInfoUrl: "https://portal.host.iveri.com/Lite/AuthoriseInfo.aspx",
};

describe("iVeri config (env only, TEST only)", () => {
  const env = (vars: Record<string, string>) => (k: string) => vars[k];

  it("is disabled without a TEST App ID", () => {
    expect(iveriConfigFromEnv(env({}))).toHaveProperty("disabled");
  });

  it("refuses anything but the TEST environment (Live needs Alex's yes)", () => {
    expect(iveriConfigFromEnv(env({ IVERI_ENVIRONMENT: "live", IVERI_APPLICATION_ID: APP_ID }))).toHaveProperty("disabled");
    expect(iveriConfigFromEnv(env({ IVERI_ENVIRONMENT: "production", IVERI_APPLICATION_ID: APP_ID }))).toHaveProperty("disabled");
  });

  it("defaults to the iVeri TEST portal", () => {
    const c = iveriConfigFromEnv(env({ IVERI_APPLICATION_ID: APP_ID })) as IveriConfig;
    expect(c.environment).toBe("test");
    expect(c.gatewayUrl).toBe("https://portal.host.iveri.com/Lite/Authorise.aspx");
    expect(c.authoriseInfoUrl).toBe("https://portal.host.iveri.com/Lite/AuthoriseInfo.aspx");
    expect(c.sharedSecret).toBeNull();
  });
});

describe("merchant reference", () => {
  it("is based on the stand number, unique per attempt and at most 20 characters", () => {
    const refs = new Set(Array.from({ length: 200 }, () => newMerchantReference("3076")));
    expect(refs.size).toBe(200);
    for (const r of refs) {
      expect(r).toMatch(/^LC3076-[A-Z2-9]{8}$/);
      expect(r.length).toBeLessThanOrEqual(20);
      expect(standFromReference(r)).toBe("3076");
    }
  });
});

describe("signed Lite form", () => {
  it("charges exactly USD 2,250 in cents with the braced, upper-case App ID and our trace", async () => {
    const form = await buildLiteForm({ config, amountCents: 225000, email: "tariro@example.com", reference: "LC3076-ABCDEFGH", description: "Stand 3076", returnUrl: "https://x.test/functions/v1/iveri-return" });
    expect(form.action).toBe(config.gatewayUrl);
    expect(form.fields).toMatchObject({
      Lite_Merchant_ApplicationId: `{${APP_ID.toUpperCase()}}`,
      Lite_Order_Amount: "225000",
      Lite_Currency_AlphaCode: "USD",
      Lite_Merchant_Trace: "LC3076-ABCDEFGH",
      MerchantReference: "LC3076-ABCDEFGH",
      Ecom_BillTo_Online_Email: "tariro@example.com",
      Ecom_TransactionComplete: "False",
    });
    const success = new URL(form.fields.Lite_Website_Successful_Url);
    expect(success.searchParams.get("trace")).toBe("LC3076-ABCDEFGH");
    expect(success.searchParams.get("kind")).toBe("success");
    expect(new URL(form.fields.Lite_Website_Fail_Url).searchParams.get("kind")).toBe("fail");
    expect(form.fields).not.toHaveProperty("Lite_Transaction_Token");
  });

  it("adds a deterministic token when a shared secret is set, and never puts the secret in the form", async () => {
    const secret = "s3cret-value-never-sent";
    const make = () =>
      buildLiteForm({ config: { ...config, sharedSecret: secret }, amountCents: 225000, email: "a@b.co", reference: "LC3076-X", description: "d", returnUrl: "https://x.test/r", now: new Date(1_764_000_000_000) });
    const [a, b] = await Promise.all([make(), make()]);
    expect(a.fields.Lite_Transaction_Token).toMatch(/^1764000000:[0-9a-f]{64}$/);
    expect(a.fields.Lite_Transaction_Token).toBe(b.fields.Lite_Transaction_Token);
    expect(JSON.stringify(a)).not.toContain(secret);
  });

  it("rejects a bad amount", async () => {
    await expect(buildLiteForm({ config, amountCents: 0, email: "a@b.co", reference: "R", description: "d", returnUrl: "https://x.test" })).rejects.toThrow();
  });
});

describe("AuthoriseInfo parsing", () => {
  it("reads HTML hidden inputs", () => {
    const html = `<input type="hidden" name="Lite_Payment_Card_Status" value="0" /><input name="Lite_Merchant_Trace" value="LC3076-A"><input name="Lite_Order_Amount" value="225000">`;
    expect(parseAuthoriseInfo(html)).toMatchObject({ cardStatus: 0, trace: "LC3076-A", amountCents: 225000 });
  });
  it("reads URL-encoded and XML responses", () => {
    expect(parseAuthoriseInfo("Lite_Payment_Card_Status=4&Lite_Result_Description=Denied&Lite_Merchant_Trace=LC3076-B")).toMatchObject({ cardStatus: 4, description: "Denied", trace: "LC3076-B" });
    expect(parseAuthoriseInfo("<r><Lite_Payment_Card_Status>14</Lite_Payment_Card_Status></r>").cardStatus).toBe(14);
  });
  it("gives null for an empty or unknown response (e.g. cancelled)", () => {
    expect(parseAuthoriseInfo("").cardStatus).toBeNull();
    expect(parseAuthoriseInfo("<html>Error</html>").cardStatus).toBeNull();
  });
});

describe("card status classification", () => {
  it("only status 0 is approved", () => {
    expect(classifyCardStatus(0).result).toBe("approved");
    for (const s of [3, 4, 5, 14, 255]) expect(classifyCardStatus(s).result).toBe("declined");
    expect(classifyCardStatus(9).result).toBe("retry_later");
    expect(classifyCardStatus(null, "fail").result).toBe("cancelled");
    expect(classifyCardStatus(null, "success").result).toBe("pending");
    expect(classifyCardStatus(99).result).toBe("error");
  });
  it("255 explains the 3-D Secure limitation; every non-approved message says no money was taken", () => {
    expect(classifyCardStatus(255).message).toMatch(/3-D Secure/);
    for (const s of [3, 4, 5, 9, 14, 255, null]) expect(classifyCardStatus(s, "fail").message).toMatch(/no money was taken/i);
  });
});

// ---- Return handler with a mocked gateway and the real payment-confirmed handler ----

const offer = { buyer: { fullName: "Tariro Moyo" }, submittedAt: "2026-11-25T10:05:00Z" } as unknown as Lead["offer"];
const baseLead = (over: Partial<Lead> = {}): Lead => ({
  id: "lead-1",
  createdAt: "2026-11-25T10:00:00Z",
  stage: "form_filled",
  contact: { fullName: "Tariro Moyo", email: "tariro@example.com", phone: "+263 77 123 4567" },
  standNumber: "3076",
  offer,
  officialUse: null,
  paidAt: null,
  paymentReference: null,
  paymentAmountCents: null,
  portalStatus: "not_started",
  portalRecords: null,
  envelopeId: null,
  signedAt: null,
  ...over,
});

function world(opts: { lead?: Lead; stand?: Partial<Stand> } = {}) {
  const s = {
    leads: [opts.lead ?? baseLead()],
    stands: [{ standNumber: "3076", phase: "3", landUse: "Residential", sizeSqm: 1500, status: "available", reservedLeadId: null, ...opts.stand } as Stand],
    attempts: [] as PaymentAttempt[],
    events: new Map<string, string>(),
    emails: 0,
    gateway: new Map<string, AuthoriseInfo | "down">(),
    gatewayCalls: 0,
    applyCalls: 0,
  };
  const attempt = (reference = newMerchantReference("3076"), leadId = "lead-1") => {
    s.attempts.push({ reference, leadId, standNumber: "3076", amountCents: 225000, status: "started", cardStatus: null, createdAt: "2026-11-25T11:00:00Z" });
    return reference;
  };
  const answer = (reference: string, cardStatus: number | null, over: Partial<AuthoriseInfo> = {}) =>
    s.gateway.set(reference, { cardStatus, description: "", trace: reference, amountCents: 225000, currency: "USD", ...over });
  const deps: IveriReturnDeps = {
    getAttempt: async (ref) => structuredClone(s.attempts.find((a) => a.reference === ref) ?? null),
    authoriseInfo: async (ref) => {
      s.gatewayCalls++;
      const a = s.gateway.get(ref);
      if (!a || a === "down") throw new Error("gateway down");
      return a;
    },
    applyPayment: async (input): Promise<ApplyStatus> => {
      s.applyCalls++;
      return handlePaymentConfirmed(
        {
          recordedOutcome: (r) => (s.events.get(r) as "applied" | "unmatched" | "rejected" | undefined) ?? null,
          lead: (id) => s.leads.find((l) => l.id === id) ?? null,
          stand: (n) => s.stands.find((x) => x.standNumber === n) ?? null,
          commit: ({ reference, outcome, stand, lead, emailFor }) => {
            s.events.set(reference, outcome.status);
            if (stand) s.stands = s.stands.map((x) => (x.standNumber === stand.standNumber ? stand : x));
            if (lead) s.leads = s.leads.map((l) => (l.id === lead.id ? lead : l));
            if (outcome.status === "applied") s.attempts = s.attempts.map((a) => (a.reference === reference ? { ...a, status: "approved", cardStatus: 0 } : a));
            if (emailFor) s.emails++;
          },
        },
        input,
      ).status;
    },
    markAttempt: async (ref, status, cardStatus) => {
      s.attempts = s.attempts.map((a) => (a.reference === ref && !isSettled(a) ? { ...a, status, cardStatus } : a));
    },
    source: "mock-iveri",
    now: () => new Date("2026-11-25T12:00:00Z"),
  };
  return { s, deps, attempt, answer };
}

describe("iVeri return handler (mocked gateway)", () => {
  it("status 0 applies the payment once: stand out of inventory, one email, wizard advances", async () => {
    const { s, deps, attempt, answer } = world();
    const ref = attempt();
    answer(ref, 0);
    const out = await processIveriReturn(deps, { reference: ref, kind: "success" });
    expect(out).toMatchObject({ result: "approved", applied: "applied", leadId: "lead-1" });
    expect(s.stands[0]).toMatchObject({ status: "paid", reservedLeadId: "lead-1" });
    expect(s.leads[0]).toMatchObject({ stage: "paid", paymentReference: ref, paymentAmountCents: 225000 });
    expect(s.emails).toBe(1);
    expect(s.attempts[0].status).toBe("approved");
  });

  it("the same reference processed twice changes nothing", async () => {
    const { s, deps, attempt, answer } = world();
    const ref = attempt();
    answer(ref, 0);
    await processIveriReturn(deps, { reference: ref, kind: "success" });
    const snapshot = structuredClone({ leads: s.leads, stands: s.stands, emails: s.emails, attempts: s.attempts });
    const again = await processIveriReturn(deps, { reference: ref, kind: "success" });
    expect(again.result).toBe("approved");
    expect({ leads: s.leads, stands: s.stands, emails: s.emails, attempts: s.attempts }).toEqual(snapshot);
    expect(s.applyCalls).toBe(1);
  });

  it("a replayed apply for the same reference is a duplicate no-op even if the attempt row was not updated", async () => {
    const { s, deps, attempt, answer } = world();
    const ref = attempt();
    answer(ref, 0);
    await processIveriReturn(deps, { reference: ref, kind: "success" });
    s.attempts[0].status = "started";
    const out = await processIveriReturn(deps, { reference: ref, kind: "success" });
    expect(out).toMatchObject({ result: "approved", applied: "duplicate" });
    expect(s.emails).toBe(1);
  });

  it.each([3, 4, 5, 9, 14, 255])("status %i shows a friendly message and changes nothing", async (status) => {
    const { s, deps, attempt, answer } = world();
    const ref = attempt();
    answer(ref, status);
    const out = await processIveriReturn(deps, { reference: ref, kind: "fail" });
    expect(out.result).not.toBe("approved");
    expect(out.message).toMatch(/no money was taken/i);
    expect(s.applyCalls).toBe(0);
    expect(s.stands[0].status).toBe("available");
    expect(s.leads[0].stage).toBe("form_filled");
    expect(s.emails).toBe(0);
    expect(s.attempts[0]).toMatchObject({ cardStatus: status });
  });

  it("cancel (no status from AuthoriseInfo) is cancelled, changes nothing and is not stored as final", async () => {
    const { s, deps, attempt, answer } = world();
    const ref = attempt();
    answer(ref, null);
    expect((await processIveriReturn(deps, { reference: ref, kind: "fail" })).result).toBe("cancelled");
    expect(s.applyCalls).toBe(0);
    expect(s.attempts[0].status).toBe("started");
  });

  it("an early check with no status (buyer still on the card page) never blocks a later approval", async () => {
    const { s, deps, attempt, answer } = world();
    const ref = attempt();
    answer(ref, null);
    await processIveriReturn(deps, { reference: ref });
    await processIveriReturn(deps, { reference: ref, kind: "trylater" });
    answer(ref, 0);
    expect(await processIveriReturn(deps, { reference: ref, kind: "success" })).toMatchObject({ result: "approved", applied: "applied" });
    expect(s.stands[0].status).toBe("paid");
  });

  it("a declined attempt is re-checked, so a later approval for that trace is still applied", async () => {
    const { s, deps, attempt, answer } = world();
    const ref = attempt();
    answer(ref, 4);
    await processIveriReturn(deps, { reference: ref, kind: "fail" });
    expect(s.attempts[0]).toMatchObject({ status: "declined", cardStatus: 4 });
    answer(ref, 0);
    expect((await processIveriReturn(deps, { reference: ref })).applied).toBe("applied");
    expect(s.emails).toBe(1);
  });

  it("does not trust the browser: a 'success' return with a declined AuthoriseInfo is declined", async () => {
    const { s, deps, attempt, answer } = world();
    const ref = attempt();
    answer(ref, 4);
    expect((await processIveriReturn(deps, { reference: ref, kind: "success" })).result).toBe("declined");
    expect(s.applyCalls).toBe(0);
  });

  it("gateway unreachable: pending, nothing changes, and a later check applies it", async () => {
    const { s, deps, attempt, answer } = world();
    const ref = attempt();
    s.gateway.set(ref, "down");
    expect((await processIveriReturn(deps, { reference: ref, kind: "success" })).result).toBe("pending");
    expect(s.attempts[0].status).toBe("started");
    answer(ref, 0);
    expect((await processIveriReturn(deps, { reference: ref })).applied).toBe("applied");
  });

  it("a missing amount, trace mismatch or non-USD currency never applies and needs a staff check", async () => {
    for (const over of [{ amountCents: null }, { trace: "LC9999-OTHER" }, { currency: "ZWG" }]) {
      const { s, deps, attempt, answer } = world();
      const ref = attempt();
      answer(ref, 0, over);
      const out = await processIveriReturn(deps, { reference: ref, kind: "success" });
      expect(out).toMatchObject({ result: "error", cardStatus: 0 });
      expect(s.applyCalls).toBe(0);
      expect(s.stands[0].status).toBe("available");
      expect(s.attempts[0]).toMatchObject({ status: "error", cardStatus: 0 });
    }
  });

  it("a wrong gateway amount is recorded as rejected (gateway amount passed through) and never applies", async () => {
    const { s, deps, attempt, answer } = world();
    const ref = attempt();
    answer(ref, 0, { amountCents: 100 });
    const out = await processIveriReturn(deps, { reference: ref, kind: "success" });
    expect(out).toMatchObject({ result: "error", applied: "rejected", cardStatus: 0 });
    expect(s.events.get(ref)).toBe("rejected");
    expect(s.stands[0].status).toBe("available");
    expect(s.emails).toBe(0);
  });

  it("a settled attempt is never overwritten by a later status", async () => {
    const { s, deps, attempt, answer } = world();
    const ref = attempt();
    answer(ref, 0);
    await processIveriReturn(deps, { reference: ref });
    await deps.markAttempt(ref, "declined", 4);
    expect(s.attempts[0]).toMatchObject({ status: "approved", cardStatus: 0 });
  });

  it("unknown reference: error, no gateway call", async () => {
    const { s, deps } = world();
    const out = await processIveriReturn(deps, { reference: "LC3076-NOPE" });
    expect(out).toMatchObject({ result: "error", leadId: null });
    expect(s.gatewayCalls).toBe(0);
  });

  it("approved for a stand already sold: recorded unmatched, buyer told LakeCity will contact them, nothing else changes", async () => {
    const { s, deps, attempt, answer } = world({ stand: { status: "paid", reservedLeadId: "someone-else" } });
    const ref = attempt();
    answer(ref, 0);
    const out = await processIveriReturn(deps, { reference: ref, kind: "success" });
    expect(out).toMatchObject({ result: "error", applied: "unmatched" });
    expect(out.message).toMatch(/LakeCity Accounts will contact you/);
    expect(s.events.get(ref)).toBe("unmatched");
    expect(s.stands[0]).toMatchObject({ status: "paid", reservedLeadId: "someone-else" });
    expect(s.leads[0].stage).toBe("form_filled");
    expect(s.emails).toBe(0);
    // A later re-check shows the same "needs check" message and never claims approval.
    const again = await processIveriReturn(deps, { reference: ref });
    expect(again).toMatchObject({ result: "error", cardStatus: 0 });
    expect(s.applyCalls).toBe(1);
  });

  it("a concurrent repeat of an unmatched reference reports the recorded outcome, never 'approved'", async () => {
    const { s, deps, attempt, answer } = world({ stand: { status: "paid", reservedLeadId: "someone-else" } });
    const ref = attempt();
    answer(ref, 0);
    await processIveriReturn(deps, { reference: ref });
    s.attempts[0] = { ...s.attempts[0], status: "started", cardStatus: null };
    const racer = await processIveriReturn(deps, { reference: ref });
    expect(racer).toMatchObject({ result: "error", applied: "unmatched", cardStatus: 0 });
    expect(s.emails).toBe(0);
  });

  it("only applied and approved-but-held attempts are settled; every other status is re-checked", () => {
    expect(isSettled({ status: "approved", cardStatus: 0 })).toBe(true);
    expect(isSettled({ status: "error", cardStatus: 0 })).toBe(true);
    for (const [status, cardStatus] of [["started", null], ["pending", null], ["declined", 4], ["retry_later", 9], ["cancelled", null], ["error", 99]] as const) {
      expect(isSettled({ status, cardStatus })).toBe(false);
    }
  });

  it("stored results: approved stays approved, approved-but-unmatched stays 'needs check'", () => {
    expect(storedResult({ status: "approved", cardStatus: 0 }).result).toBe("approved");
    expect(storedResult({ status: "error", cardStatus: 0 }).title).toBe("We need to check this payment");
    expect(storedResult({ status: "declined", cardStatus: 4 }).result).toBe("declined");
  });
});
