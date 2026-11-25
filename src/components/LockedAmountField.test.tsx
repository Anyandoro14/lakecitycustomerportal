import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LockedAmountField } from "@/components/LockedAmountField";
import { paymentDueNowCents } from "@shared/domain/campaign.ts";

const inputOf = (html: string) => html.match(/<input[^>]*>/)![0];

describe("card payment amount field", () => {
  const html = renderToStaticMarkup(<LockedAmountField id="payment-amount" label="Amount due now" amountCents={paymentDueNowCents()} />);

  it("is auto-populated with USD 2,250", () => {
    expect(paymentDueNowCents()).toBe(225000);
    expect(html).toContain('value="$2,250"');
  });

  it("is read-only, not disabled, and can't be tabbed into", () => {
    const input = inputOf(html);
    expect(input).toMatch(/\sreadonly(=""|\s|>)/i);
    expect(input).toContain('aria-readonly="true"');
    expect(input).toContain('tabindex="-1"');
    expect(input).not.toMatch(/\sdisabled(=""|\s|>)/);
  });
});
