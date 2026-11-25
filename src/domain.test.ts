import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { MERGE_FIELDS } from "@shared/domain/agreement-fields.ts";
import { validateIdentity, zimbabweCheckLetter } from "@shared/domain/id-validation.ts";
import { computeSchedule } from "@shared/domain/schedule.ts";
import { sniffIdUploadMime } from "@shared/domain/uploads.ts";

const NOW = new Date("2026-11-25T12:00:00Z");
const ok = (country: string, idNumber: string, idType: "national_id" | "passport" = "national_id", expiryDate?: string) =>
  validateIdentity({ idType, issuingCountry: country, idNumber, expiryDate }, NOW);

describe("Zimbabwe national ID", () => {
  it("computes mod-23 check letters (Pachedu 2018 Appendix 2 + published examples)", () => {
    // Pachedu report: real record 63-446236-Z61; the mistyped "03-446236" would have needed H.
    expect(zimbabweCheckLetter("63446236")).toBe("Z");
    expect(zimbabweCheckLetter("03446236")).toBe("H");
    // Examples from identique/idnumbers issue #277.
    expect(zimbabweCheckLetter("502001148")).toBe("W");
    expect(zimbabweCheckLetter("082095850")).toBe("T");
  });
  it("accepts valid IDs with or without separators", () => {
    expect(ok("ZW", "63-446236 Z 61").ok).toBe(true);
    expect(ok("ZW", "63446236z61").ok).toBe(true);
    expect(ok("ZW", "50-2001148-W-50").ok).toBe(true);
  });
  it("rejects wrong check letter and bad format", () => {
    expect(ok("ZW", "63-446236 H 61").errors.idNumber).toMatch(/check letter/);
    expect(ok("ZW", "63-12345A42").errors.idNumber).toMatch(/2 digits/);
  });
});

describe("South Africa ID", () => {
  it("accepts a Luhn-valid ID", () => expect(ok("ZA", "8001015009087").ok).toBe(true));
  it("rejects a bad check digit", () => expect(ok("ZA", "8001015009086").errors.idNumber).toMatch(/check digit/));
  it("rejects a bad date", () => expect(ok("ZA", "8013015009087").ok).toBe(false));
});

describe("generic national ID + passport", () => {
  it("uses the generic rule for countries without a validator", () => {
    expect(ok("KE", "12345678").ok).toBe(true);
    expect(ok("KE", "12").errors.idNumber).toBeDefined();
  });
  it("rejects expired national ID when an expiry is given", () => {
    expect(ok("KE", "12345678", "national_id", "2020-01-01").errors.expiryDate).toMatch(/expired/);
  });
  it("requires passport expiry in the future", () => {
    expect(ok("GB", "123456789", "passport").errors.expiryDate).toMatch(/required/);
    expect(ok("GB", "123456789", "passport", "2026-11-25").errors.expiryDate).toMatch(/expired/);
    expect(ok("GB", "12345 6789", "passport", "2030-01-01").ok).toBe(true);
    expect(ok("GB", "12345", "passport", "2030-01-01").errors.idNumber).toBeDefined();
  });
  it("requires an ISO issuing country", () => {
    expect(ok("", "123456789", "passport", "2030-01-01").errors.issuingCountry).toBeDefined();
    expect(ok("QQ", "123456789", "passport", "2030-01-01").errors.issuingCountry).toBeDefined();
  });
});

describe("payment schedule", () => {
  it("instalment = (price - deposit) / 48, final instalment absorbs rounding", () => {
    const s = computeSchedule({ priceUsd: 25000, depositUsd: 2500, termMonths: 48, depositInstalments: 1, dueDay: 5, startDate: "2026-11-25" });
    expect(s.rows).toHaveLength(49);
    expect(s.monthlyInstalmentCents).toBe(46875);
    expect(s.rows.at(-1)!.balanceCents).toBe(0);
    expect(s.rows[1].dueDate).toBe("2026-12-05");
    expect(s.rows.at(-1)!.dueDate).toBe("2030-11-05");
  });
  it("handles uneven division and 3-part deposits", () => {
    const s = computeSchedule({ priceUsd: 10000, depositUsd: 1000, termMonths: 48, depositInstalments: 3, dueDay: 1, startDate: "2026-01-31" });
    const instalments = s.rows.filter((r) => r.kind === "instalment");
    expect(s.rows.filter((r) => r.kind === "deposit").map((r) => r.amountCents)).toEqual([33333, 33333, 33334]);
    expect(instalments).toHaveLength(48);
    expect(instalments.reduce((a, r) => a + r.amountCents, 0)).toBe(900000);
    expect(s.rows.at(-1)!.balanceCents).toBe(0);
    expect(instalments[0].dueDate).toBe("2026-04-01");
  });
});

describe("uploads", () => {
  it("sniffs magic bytes", () => {
    expect(sniffIdUploadMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffIdUploadMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffIdUploadMime(new TextEncoder().encode("hello"))).toBeNull();
  });
});

describe("agreement template", () => {
  it("contains exactly the merge fields the app fills", async () => {
    const pdf = await PDFDocument.load(readFileSync("public/templates/agreement-of-sale-PLACEHOLDER.pdf"));
    const names = pdf.getForm().getFields().map((f) => f.getName()).sort();
    expect(names).toEqual(MERGE_FIELDS.map((f) => f.key).sort());
  });
});
