import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LockedAmountField } from "@/components/LockedAmountField";
import { paymentDueNowCents } from "@shared/domain/campaign.ts";

describe("ZikiMall amount field", () => {
  const html = renderToStaticMarkup(<LockedAmountField id="zikimall-amount" label="Amount due now" amountCents={paymentDueNowCents()} />);

  it("is auto-populated with USD 2,250", () => {
    expect(html).toContain('value="$2,250"');
  });

  it("is not editable", () => {
    const input = html.match(/<input[^>]*>/)![0];
    expect(input).toMatch(/\sreadonly(=""|\s|>)/i);
    expect(input).toContain('aria-readonly="true"');
    expect(input).not.toMatch(/\sdisabled(=""|\s|>)/);
  });
});
