import { describe, expect, it } from "vitest";
import {
  sanitizeProperties,
  sanitizeUrl,
  scrubExceptionText,
  scrubText,
} from "./sanitize";

describe("scrubText", () => {
  it("redacts emails and digit runs of 6+", () => {
    expect(scrubText("Contact alex@lakecity.co.zw about 112988509")).toBe(
      "Contact [email] about [digits]",
    );
    expect(scrubText("short 12345 ok")).toBe("short 12345 ok");
    expect(scrubText("ref 123456")).toBe("ref [digits]");
  });
});

describe("sanitizeUrl", () => {
  it("strips query strings and hash fragments", () => {
    expect(sanitizeUrl("/pay/return?reference=ABC123456&x=1#section")).toBe(
      "/pay/return",
    );
    expect(sanitizeUrl("https://portal.example/pay?token=secret#top")).toBe(
      "https://portal.example/pay",
    );
  });

  it("scrubs emails and long digits in the path", () => {
    expect(sanitizeUrl("/u/alex@example.com/2779454018")).toBe(
      "/u/[email]/[digits]",
    );
  });
});

describe("sanitizeProperties", () => {
  it("strips URL query/hash and drops sensitive keys", () => {
    const cleaned = sanitizeProperties({
      $current_url: "https://x.test/pay/return?reference=ABCDEF&amt=100#ok",
      email: "person@example.com",
      amount: 99.5,
      stand_number: "A123",
      note: "mail me at ops@lakecity.co.zw code 998877",
      method: "ecocash",
    });
    expect(cleaned.$current_url).toBe("https://x.test/pay/return");
    expect(cleaned.email).toBeUndefined();
    expect(cleaned.amount).toBeUndefined();
    expect(cleaned.stand_number).toBeUndefined();
    expect(cleaned.note).toBe("mail me at [email] code [digits]");
    expect(cleaned.method).toBe("ecocash");
  });
});

describe("scrubExceptionText", () => {
  it("scrubs emails and long digit runs from stacks", () => {
    const stack =
      "Error: user person@example.com failed txn 1234567890\n    at pay (/pay/return?ref=1)";
    expect(scrubExceptionText(stack)).toContain("[email]");
    expect(scrubExceptionText(stack)).toContain("[digits]");
    expect(scrubExceptionText(stack)).not.toMatch(/person@example\.com/);
    expect(scrubExceptionText(stack)).not.toMatch(/1234567890/);
  });
});
