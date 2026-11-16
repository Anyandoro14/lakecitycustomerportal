import { describe, expect, it } from "vitest";
import { normalizePhoneE164 } from "../../supabase/functions/_shared/phone";

describe("normalizePhoneE164", () => {
  it("strips a leading apostrophe from a sheet cell", () => {
    expect(normalizePhoneE164("'0771234567")).toBe("+263771234567");
    expect(normalizePhoneE164("'+263771234567")).toBe("+263771234567");
  });
  it("removes spaces, dashes, dots and brackets", () => {
    expect(normalizePhoneE164(" (077) 123-45.67 ")).toBe("+263771234567");
    expect(normalizePhoneE164("+263 77 123 4567")).toBe("+263771234567");
    expect(normalizePhoneE164("\u00a0077\u00a01234567")).toBe("+263771234567");
  });
  it("handles 00 and bare country code prefixes", () => {
    expect(normalizePhoneE164("00263771234567")).toBe("+263771234567");
    expect(normalizePhoneE164("263771234567")).toBe("+263771234567");
    expect(normalizePhoneE164("771234567")).toBe("+263771234567");
  });
  it("keeps foreign numbers that already have +", () => {
    expect(normalizePhoneE164("+44 7700 900123")).toBe("+447700900123");
  });
  it("rejects empty or junk", () => {
    expect(normalizePhoneE164("")).toBeNull();
    expect(normalizePhoneE164("'")).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164("12")).toBeNull();
  });
});
