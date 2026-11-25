import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LockedAmountField, LockedField } from "@/components/LockedAmountField";
import { paymentDueNowCents } from "@shared/domain/campaign.ts";
import { zikimallAccountNumber, zikimallSteps } from "@shared/domain/payment-methods.ts";

const inputOf = (html: string) => html.match(/<input[^>]*>/)![0];
const expectReadOnly = (input: string) => {
  expect(input).toMatch(/\sreadonly(=""|\s|>)/i);
  expect(input).toContain('aria-readonly="true"');
  expect(input).toContain('tabindex="-1"');
  expect(input).not.toMatch(/\sdisabled(=""|\s|>)/);
};

describe("ZikiMall amount field", () => {
  const html = renderToStaticMarkup(<LockedAmountField id="zikimall-amount" label="Amount due now" amountCents={paymentDueNowCents()} />);

  it("is auto-populated with USD 2,250", () => {
    expect(html).toContain('value="$2,250"');
  });

  it("is not editable and has a copy button", () => {
    expectReadOnly(inputOf(html));
    expect(html).toContain('data-testid="zikimall-amount-copy"');
  });
});

describe("ZikiMall account number field", () => {
  const selected = { standNumber: "3076" };
  const value = zikimallAccountNumber(selected);
  const html = renderToStaticMarkup(<LockedField id="zikimall-account" label="Account number" value={value} copyLabel="Copy account number" />);

  it("equals the selected stand number", () => {
    expect(value).toBe("3076");
    expect(inputOf(html)).toContain('value="3076"');
  });

  it("is read-only and has a copy button", () => {
    expectReadOnly(inputOf(html));
    expect(html).toContain('data-testid="zikimall-account-copy"');
  });

  it("step 5 tells the customer their stand number is the account number", () => {
    const steps = zikimallSteps("3076");
    expect(steps).toHaveLength(7);
    expect(steps[4]).toBe("Enter your account number (your stand number: 3076), Initial and Surname.");
    expect(steps[0]).toBe("Go to zikimall.com.");
    expect(steps[5]).toBe("Select your preferred method of payment (Visa / Mastercard / Ecocash / Zimswitch).");
  });
});
