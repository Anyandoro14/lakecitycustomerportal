import { afterEach, describe, expect, it } from "vitest";
import {
  __resetTelemetryForTests,
  __setTelemetryTestTransport,
  initTelemetry,
} from "./client";
import {
  trackPaymentFlowStarted,
  trackPaymentInstructionsViewed,
  trackStatementViewed,
  trackZikimallRedirected,
} from "./events";

afterEach(() => {
  __resetTelemetryForTests();
  __setTelemetryTestTransport(null);
});

describe("payment funnel events (no PayNow)", () => {
  it("emits zikimall_redirected and payment_instructions_viewed without PII", () => {
    const seen: Array<{ event: string; properties: Record<string, unknown> }> = [];
    __setTelemetryTestTransport((p) => seen.push(p));
    initTelemetry({ posthogKey: "", posthogHost: "", telemetrySalt: "" });

    trackPaymentFlowStarted("pay_page");
    trackZikimallRedirected();
    trackPaymentInstructionsViewed("bank_transfer");
    trackStatementViewed();

    expect(seen.map((s) => s.event)).toEqual([
      "payment_flow_started",
      "zikimall_redirected",
      "payment_instructions_viewed",
      "statement_viewed",
    ]);
    expect(seen[0].properties.source).toBe("pay_page");
    expect(seen[2].properties.section).toBe("bank_transfer");
    // No residual PayNow event names
    expect(seen.every((s) => !s.event.includes("paynow"))).toBe(true);
    expect(seen.every((s) => s.event !== "payment_method_selected")).toBe(true);
  });
});
