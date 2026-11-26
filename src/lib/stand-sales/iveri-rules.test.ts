import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildLiteForm,
  gatewayUrlProblem,
  iveriConfigFromEnv,
  newMerchantReference,
  parseAuthoriseInfo,
  processIveriReturn,
  recheckAllAttempts,
  reviewBeforeStart,
  isStaffAttention,
  type ApplyStatus,
  type AuthoriseInfo,
  type IveriConfig,
  type IveriReturnDeps,
  type PaymentAttempt,
} from "../../../supabase/functions/_shared/iveri.ts";
import { buildResendRequest, renderStandSalesEmail, sendWithTransport } from "../../../supabase/functions/_shared/stand-sales-email.ts";
import { dismissForStaff, sha256Hex, startCardPayment, type SalesStore } from "../../../supabase/functions/_shared/stand-sales-service.ts";

const APP_ID = "00000000-0000-4000-8000-000000000001";
const config: IveriConfig = {
  environment: "test",
  applicationId: APP_ID,
  sharedSecret: null,
  gatewayUrl: "https://portal.host.iveri.com/Lite/Authorise.aspx",
  authoriseInfoUrl: "https://portal.host.iveri.com/Lite/AuthoriseInfo.aspx",
  simulations: false,
};

describe("iVeri env defaults off and hosts are allow-listed", () => {
  const env = (vars: Record<string, string>) => (key: string) => vars[key];

  it("stays off unless IVERI_ENVIRONMENT is exactly test", () => {
    expect(iveriConfigFromEnv(env({}))).toMatchObject({ disabled: expect.stringMatching(/off/i) });
    expect(iveriConfigFromEnv(env({ IVERI_APPLICATION_ID: APP_ID }))).toMatchObject({ disabled: expect.stringMatching(/off/i) });
    expect(iveriConfigFromEnv(env({ IVERI_ENVIRONMENT: "live", IVERI_APPLICATION_ID: APP_ID }))).toHaveProperty("disabled");
    expect(iveriConfigFromEnv(env({ IVERI_ENVIRONMENT: "production", IVERI_APPLICATION_ID: APP_ID }))).toHaveProperty("disabled");
  });

  it("accepts the TEST portal and rejects other gateway hosts", () => {
    const ready = iveriConfigFromEnv(env({ IVERI_ENVIRONMENT: "test", IVERI_APPLICATION_ID: APP_ID })) as IveriConfig;
    expect(ready.gatewayUrl).toBe("https://portal.host.iveri.com/Lite/Authorise.aspx");
    expect(iveriConfigFromEnv(env({
      IVERI_ENVIRONMENT: "test",
      IVERI_APPLICATION_ID: APP_ID,
      IVERI_GATEWAY_URL: "https://evil.example/Lite/Authorise.aspx",
    }))).toHaveProperty("disabled");
    expect(gatewayUrlProblem("http://127.0.0.1:9/Lite/AuthoriseInfo.aspx", false)).toMatch(/allowed/i);
    expect(gatewayUrlProblem("http://127.0.0.1:9/Lite/AuthoriseInfo.aspx", true)).toBeNull();
  });
});

describe("signed Lite form", () => {
  it("charges 225000 cents and sends MerchantReference plus LC_Nonce", async () => {
    const form = await buildLiteForm({
      config,
      amountCents: 225000,
      email: "tariro@example.com",
      reference: "LC3076-ABCDEFGH",
      nonce: "abc123noncevalue",
      description: "Stand 3076",
      returnUrl: "https://x.test/functions/v1/iveri-return",
    });
    expect(form.fields.Lite_Order_Amount).toBe("225000");
    expect(form.fields.MerchantReference).toBe("LC3076-ABCDEFGH");
    expect(form.fields.LC_Nonce).toBe("abc123noncevalue");
    expect(form.fields.Lite_Currency_AlphaCode).toBe("USD");
    expect(newMerchantReference("3076").length).toBeLessThanOrEqual(20);
  });

  it("never puts the shared secret in the form", async () => {
    const secret = "s3cret-value-never-sent";
    const form = await buildLiteForm({
      config: { ...config, sharedSecret: secret },
      amountCents: 225000,
      email: "a@b.co",
      reference: "LC3076-ABCDEFGH",
      nonce: "n",
      description: "d",
      returnUrl: "https://x.test/r",
      now: new Date(1_764_000_000_000),
    });
    expect(form.fields.Lite_Transaction_Token).toMatch(/^1764000000:[0-9a-f]{64}$/);
    expect(JSON.stringify(form)).not.toContain(secret);
  });
});

describe("AuthoriseInfo TEST fixture", () => {
  it("reads a realistic approved TEST response and does not return the card number", () => {
    const html = readFileSync("src/lib/stand-sales/fixtures/iveri-authorise-info-approved.html", "utf8");
    const parsed = parseAuthoriseInfo(html);
    expect(parsed).toEqual({
      cardStatus: 0,
      description: "Approved",
      trace: "LC3076-ABCDEFGH",
      amountCents: 225000,
      currency: "USD",
      merchantReference: "LC3076-ABCDEFGH",
      nonce: "abc123noncevalue",
    });
    expect(JSON.stringify(parsed)).not.toContain("424242");
  });
});

function world() {
  const attempts: PaymentAttempt[] = [];
  const state = { stage: "offer" as "offer" | "paid", emails: 0, applyCalls: 0, gatewayCalls: 0 };
  const gateway = new Map<string, AuthoriseInfo | "down">();
  const attempt = (over: Partial<PaymentAttempt> = {}): PaymentAttempt => {
    const row: PaymentAttempt = {
      reference: over.reference ?? "LC3076-ABCDEFGH",
      applicationId: "app-1",
      standNumber: "3076",
      amountCents: 225000,
      nonce: "abc123noncevalue",
      status: "started",
      cardStatus: null,
      createdAt: "2026-11-25T11:00:00.000Z",
      dismissedAt: null,
      ...over,
    };
    attempts.push(row);
    return row;
  };
  const deps: IveriReturnDeps = {
    getAttempt: async (reference) => attempts.find((row) => row.reference === reference) ?? null,
    authoriseInfo: async (reference) => {
      state.gatewayCalls += 1;
      const info = gateway.get(reference);
      if (!info || info === "down") throw new Error("gateway down");
      return info;
    },
    applyPayment: async (input): Promise<ApplyStatus> => {
      state.applyCalls += 1;
      if (input.amountCents !== 225000) return "rejected:amount";
      if (input.merchantReference !== input.reference) return "rejected:merchant_reference";
      if (input.nonce !== "abc123noncevalue") return "rejected:nonce";
      if (state.stage === "paid") return "unmatched:already_paid";
      state.stage = "paid";
      state.emails += 1;
      const row = attempts.find((item) => item.reference === input.reference);
      if (row) {
        row.status = "approved";
        row.cardStatus = 0;
      }
      return "applied";
    },
    markAttempt: async (reference, status, cardStatus) => {
      const row = attempts.find((item) => item.reference === reference);
      if (!row || row.status === "approved" || (row.status === "error" && row.cardStatus === 0)) return;
      row.status = status;
      row.cardStatus = cardStatus;
    },
    emailFor: () => ({ to: "tariro@example.com", subject: "Payment received", html: "<p>queued</p>" }),
    source: "mock-iveri",
    now: () => new Date("2026-11-25T12:00:00Z"),
  };
  const answer = (reference: string, cardStatus: number | null, over: Partial<AuthoriseInfo> = {}) => {
    gateway.set(reference, {
      cardStatus,
      description: "",
      trace: reference,
      amountCents: 225000,
      currency: "USD",
      merchantReference: reference,
      nonce: "abc123noncevalue",
      ...over,
    });
  };
  return { attempts, state, deps, attempt, answer, gateway };
}

describe("server re-check, 409 hold, and staff list", () => {
  it("confirms only status 0 with the exact amount, merchant reference and nonce", async () => {
    const { state, deps, attempt, answer } = world();
    const row = attempt();
    answer(row.reference, 0);
    const out = await processIveriReturn(deps, { reference: row.reference, kind: "success" });
    expect(out).toMatchObject({ result: "approved", applied: "applied" });
    expect(state.emails).toBe(1);
    const again = await processIveriReturn(deps, { reference: row.reference });
    expect(again.applied).toBe("duplicate");
    expect(state.applyCalls).toBe(1);
  });

  it("does not confirm a nonce or merchant-reference mismatch", async () => {
    const nonce = world();
    const row = nonce.attempt();
    nonce.answer(row.reference, 0, { nonce: "other-nonce" });
    expect((await processIveriReturn(nonce.deps, { reference: row.reference })).reason).toBe("nonce");
    expect(nonce.state.stage).toBe("offer");

    const merchant = world();
    const other = merchant.attempt();
    merchant.answer(other.reference, 0, { merchantReference: "LC0000-OTHER" });
    expect((await processIveriReturn(merchant.deps, { reference: other.reference })).reason).toBe("merchant_reference");
    expect(merchant.state.stage).toBe("offer");
  });

  it("re-checks an older attempt before starting another payment", async () => {
    const { deps, attempt, answer, attempts, state } = world();
    const older = attempt({ reference: "LC3076-OLDER111", createdAt: "2026-11-25T10:00:00.000Z", status: "declined", cardStatus: 4 });
    answer(older.reference, 0);
    const review = await reviewBeforeStart(deps, attempts);
    expect(review).toMatchObject({ kind: "stop", code: "already_approved" });
    expect(state.stage).toBe("paid");
    expect(attempts).toHaveLength(1);
  });

  it("returns 409 while an approved payment is held, and staff dismiss releases it", async () => {
    const { deps, attempt, attempts } = world();
    const held = attempt({ status: "error", cardStatus: 0, createdAt: "2026-11-25T10:00:00.000Z" });
    expect(await reviewBeforeStart(deps, attempts)).toMatchObject({ kind: "stop", status: 409, code: "payment_held" });
    held.status = "dismissed";
    held.dismissedAt = "2026-11-25T12:30:00.000Z";
    expect(await reviewBeforeStart(deps, attempts)).toMatchObject({ kind: "proceed" });
  });

  it("check payment status re-checks every unsettled attempt, not only the latest", async () => {
    const { deps, attempt, answer, attempts, state } = world();
    const first = attempt({ reference: "LC3076-FIRST111", createdAt: "2026-11-25T10:00:00.000Z", status: "declined", cardStatus: 4 });
    const second = attempt({ reference: "LC3076-SECOND22", createdAt: "2026-11-25T11:00:00.000Z", status: "declined", cardStatus: 4 });
    answer(first.reference, 4);
    answer(second.reference, 0);
    const outcomes = await recheckAllAttempts(deps, attempts);
    expect(state.gatewayCalls).toBe(2);
    expect(outcomes.map((item) => item.reference)).toEqual([first.reference, second.reference]);
    expect(outcomes[1].result).toBe("approved");
  });

  it("lists old declined attempts and held payments, and hides a fresh decline", () => {
    const now = Date.parse("2026-11-25T12:00:00.000Z");
    const base: PaymentAttempt = {
      reference: "LC3076-ABCDEFGH",
      applicationId: "app-1",
      standNumber: "3076",
      amountCents: 225000,
      nonce: "n",
      status: "declined",
      cardStatus: 4,
      createdAt: "2026-11-25T11:00:00.000Z",
      dismissedAt: null,
    };
    expect(isStaffAttention({ ...base, createdAt: "2026-11-25T11:45:00.000Z" }, now)).toBe(false);
    expect(isStaffAttention({ ...base, createdAt: "2026-11-25T11:00:00.000Z" }, now)).toBe(true);
    expect(isStaffAttention({ ...base, status: "error", cardStatus: 0, createdAt: "2026-11-25T11:59:00.000Z" }, now)).toBe(true);
    expect(isStaffAttention({ ...base, status: "approved", cardStatus: 0, createdAt: "2026-11-25T08:00:00.000Z" }, now)).toBe(false);
  });

  it("tells an already-paid buyer about a second approved charge", async () => {
    const { deps, attempt, answer, state } = world();
    state.stage = "paid";
    const row = attempt({ reference: "LC3076-SECOND22" });
    answer(row.reference, 0);
    const out = await processIveriReturn(deps, { reference: row.reference, kind: "success" });
    expect(out.result).toBe("second_charge");
    expect(out.message).toMatch(/second charge/i);
    expect(out.message).toContain(row.reference);
  });
});

describe("start payment uses the re-check", () => {
  it("does not insert a new attempt when an older one is approved on re-check", async () => {
    const token = "buyer-token";
    const hash = await sha256Hex(token);
    const attempts: PaymentAttempt[] = [{
      reference: "LC3076-OLDER111",
      applicationId: "app-1",
      standNumber: "3076",
      amountCents: 225000,
      nonce: "abc123noncevalue",
      status: "declined",
      cardStatus: 4,
      createdAt: "2026-11-25T10:00:00.000Z",
      dismissedAt: null,
    }];
    let inserted = 0;
    let stage: "offer" | "paid" = "offer";
    const store = {
      listStands: async () => [],
      standByNumber: async () => ({ id: "inv-1", standNumber: "3076", available: true, sizeSqm: 1622 }),
      insertApplication: async () => { throw new Error("unused"); },
      getApplication: async () => ({
        id: "app-1",
        standNumber: "3076",
        standInventoryId: "inv-1",
        fullName: "Tariro Moyo",
        email: "tariro@example.com",
        phone: "+263771234567",
        stage,
        offer: { accepted: true },
        paidAt: null,
        paymentReference: null,
        paymentAmountCents: null,
        portalUserId: null,
        accessTokenHash: hash,
      }),
      saveOffer: async () => undefined,
      listAttempts: async () => attempts,
      getAttempt: async (reference: string) => attempts.find((row) => row.reference === reference) ?? null,
      holdReason: async () => null,
      insertAttempt: async () => { inserted += 1; },
      markAttempt: async (reference: string, status: PaymentAttempt["status"], cardStatus: number | null) => {
        const row = attempts.find((item) => item.reference === reference);
        if (!row || row.status === "approved") return;
        row.status = status;
        row.cardStatus = cardStatus;
      },
      applyPayment: async () => {
        stage = "paid";
        attempts[0].status = "approved";
        attempts[0].cardStatus = 0;
        return "applied" as ApplyStatus;
      },
      queueEmail: async () => undefined,
      listStaffQueue: async () => [],
      dismissAttempt: async () => null,
      profileForStand: async () => null,
      createPortalUser: async () => "user-1",
      setPortalUser: async () => undefined,
      isStaff: async () => false,
    } as SalesStore;
    const started = await startCardPayment({
      store,
      config: { ...config, simulations: true },
      applicationId: "app-1",
      accessToken: token,
      returnUrl: "http://127.0.0.1:54321/functions/v1/iveri-return",
      authoriseInfo: async () => ({
        cardStatus: 0,
        description: "Approved",
        trace: "LC3076-OLDER111",
        amountCents: 225000,
        currency: "USD",
        merchantReference: "LC3076-OLDER111",
        nonce: "abc123noncevalue",
      }),
    });
    expect(started.alreadyApproved).toBe(true);
    expect(inserted).toBe(0);
  });
});

describe("emails stay in tests and the outbox", () => {
  it("renders a template and sends it only through an injected transport", async () => {
    const email = renderStandSalesEmail({ template: "payment_thank_you", to: "tariro@example.com", standNumber: "3076", fullName: "Tariro Moyo", amountCents: 225000, reference: "LC3076-ABCDEFGH" });
    expect(email.html).toContain("LakeCity");
    expect(email.html).toContain("3076");
    expect(email.html).not.toMatch(/\d{8,}/);
    const fetchMock = vi.fn(async (_url: string, _init?: unknown) => ({ ok: true }));
    const request = buildResendRequest("test-key-not-real", email);
    await fetchMock(request.url, request.init);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.resend.com/emails");
    const sent: string[] = [];
    await sendWithTransport(email, { send: async (message) => { sent.push(message.to); } });
    expect(sent).toEqual(["tariro@example.com"]);
  });
});

describe("staff dismiss re-checks the bank first", () => {
  const attempt = {
    reference: "LC3076-OLDER111",
    applicationId: "app-1",
    standNumber: "3076",
    amountCents: 225000,
    nonce: "n",
    status: "declined" as const,
    cardStatus: 4,
    createdAt: "2026-11-25T10:00:00.000Z",
    dismissedAt: null,
  };

  function store(row: PaymentAttempt = { ...attempt }) {
    return {
      isStaff: async () => true,
      getAttempt: async () => row,
      dismissAttempt: async () => ({ ...row, status: "dismissed" as const, dismissedAt: "2026-11-25T12:00:00.000Z" }),
    } as unknown as SalesStore;
  }

  it("refuses to dismiss an attempt the bank has approved", async () => {
    await expect(dismissForStaff(store(), "staff-1", attempt.reference, async () => ({
      result: "approved",
      cardStatus: 0,
      title: "Payment approved",
      message: "approved",
      applicationId: "app-1",
      reference: attempt.reference,
      applied: "applied",
      reason: null,
    }))).rejects.toMatchObject({ code: "approved" });
  });

  it("dismisses a held payment without another bank call, which releases the 409", async () => {
    let called = 0;
    const held = { ...attempt, status: "error" as const, cardStatus: 0 };
    const result = await dismissForStaff(store(held), "staff-1", held.reference, async () => {
      called += 1;
      throw new Error("should not recheck a held payment");
    });
    expect(called).toBe(0);
    expect(result.status).toBe("dismissed");
  });
});
