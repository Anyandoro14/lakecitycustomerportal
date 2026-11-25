import { describe, expect, it } from "vitest";
import seed from "@/data/stands.seed.json";
import {
  DUE_AT_START_USD,
  PRICING,
  bandOf,
  filterByBand,
  paymentDueNowCents,
  priceBands,
  quoteForSize,
  standPriceCents,
} from "@shared/domain/campaign.ts";
import { computeSchedule } from "@shared/domain/schedule.ts";

describe("pricing rules", () => {
  it("prices every stand at USD 45 per sqm", () => {
    expect(PRICING.pricePerSqmUsd).toBe(45);
    expect(standPriceCents(300)).toBe(13_500_00);
    expect(standPriceCents(523)).toBe(23_535_00);
    expect(standPriceCents(1)).toBe(45_00);
    for (const s of seed.stands) expect(quoteForSize(s.sizeSqm).priceCents).toBe(s.sizeSqm * 45 * 100);
  });

  it("takes exactly USD 2,250 at the start: USD 1,750 down payment + USD 500 legal fee", () => {
    expect(PRICING.downPaymentUsd).toBe(1750);
    expect(PRICING.legalFeeUsd).toBe(500);
    expect(DUE_AT_START_USD).toBe(2250);
    expect(paymentDueNowCents()).toBe(2_250_00);
    for (const size of [300, 450, 523, 890]) {
      const q = quoteForSize(size);
      expect(q.downPaymentCents).toBe(1_750_00);
      expect(q.legalFeeCents).toBe(500_00);
      expect(q.dueNowCents).toBe(2_250_00);
    }
  });

  it("spreads the balance (price - down payment) over 48 months; the legal fee is not part of the price", () => {
    const q = quoteForSize(500);
    expect(q.priceCents).toBe(22_500_00);
    expect(q.balanceCents).toBe(22_500_00 - 1_750_00);
    expect(q.termMonths).toBe(48);
    expect(q.monthlyCents).toBe(43229);
    expect(q.monthlyCents * 47 + q.finalMonthlyCents).toBe(q.balanceCents);
  });

  it("rejects unknown or invalid sizes", () => {
    expect(() => quoteForSize(0)).toThrow();
    expect(() => quoteForSize(Number.NaN)).toThrow();
  });
});

describe("collection schedule", () => {
  it("row 1 is the USD 2,250 due now; then 48 instalments that clear the balance", () => {
    const s = computeSchedule({ sizeSqm: 500, startDate: "2026-11-25", dueDay: 5 });
    expect(s.rows).toHaveLength(49);
    expect(s.rows[0]).toMatchObject({ kind: "due_now", amountCents: 2_250_00, dueDate: "2026-11-25", balanceCents: 20_750_00 });
    const instalments = s.rows.filter((r) => r.kind === "instalment");
    expect(instalments).toHaveLength(48);
    expect(instalments.reduce((a, r) => a + r.amountCents, 0)).toBe(20_750_00);
    expect(s.rows.at(-1)!.balanceCents).toBe(0);
    expect(instalments[0].dueDate).toBe("2026-12-05");
    expect(instalments.at(-1)!.dueDate).toBe("2030-11-05");
  });
});

describe("price ranges A / B / C", () => {
  const bands = priceBands([100_00, 400_00, 250_00, 175_00])!;

  it("splits the span between the cheapest and dearest stand into three equal bands", () => {
    expect(bands.minCents).toBe(100_00);
    expect(bands.maxCents).toBe(400_00);
    expect(bands.bands.map((b) => [b.key, b.fromCents, b.toCents])).toEqual([
      ["A", 100_00, 200_00],
      ["B", 200_00, 300_00],
      ["C", 300_00, 400_00],
    ]);
  });

  it("puts each price in exactly one band; lower edge inclusive, A cheapest, C dearest", () => {
    expect(bandOf(100_00, bands)).toBe("A");
    expect(bandOf(199_99, bands)).toBe("A");
    expect(bandOf(200_00, bands)).toBe("B");
    expect(bandOf(299_99, bands)).toBe("B");
    expect(bandOf(300_00, bands)).toBe("C");
    expect(bandOf(400_00, bands)).toBe("C");
  });

  it("uses exact thirds when the span does not divide by 3", () => {
    const b = priceBands([0, 100])!;
    expect(bandOf(33, b)).toBe("A");
    expect(bandOf(34, b)).toBe("B");
    expect(bandOf(66, b)).toBe("B");
    expect(bandOf(67, b)).toBe("C");
  });

  it("handles a single price and no prices", () => {
    expect(bandOf(500_00, priceBands([500_00])!)).toBe("A");
    expect(priceBands([])).toBeNull();
  });
});

describe("filter by range (campaign stands)", () => {
  const stands = seed.stands.map((s) => ({ ...s }));
  const a = filterByBand(stands, "A");
  const b = filterByBand(stands, "B");
  const c = filterByBand(stands, "C");
  const price = (s: { sizeSqm: number }) => standPriceCents(s.sizeSqm);

  it("has 38 stands, all sized", () => {
    expect(stands).toHaveLength(38);
    expect(stands.every((s) => s.sizeSqm > 0)).toBe(true);
  });

  it("'all' returns every stand; A, B and C partition the list", () => {
    expect(filterByBand(stands, "all")).toHaveLength(38);
    expect(a.length + b.length + c.length).toBe(38);
    const ids = new Set([...a, ...b, ...c].map((s) => s.standNumber));
    expect(ids.size).toBe(38);
    expect(a.length && b.length && c.length).toBeTruthy();
  });

  it("A is cheapest and C dearest: every A < every B < every C", () => {
    expect(Math.max(...a.map(price))).toBeLessThan(Math.min(...b.map(price)));
    expect(Math.max(...b.map(price))).toBeLessThan(Math.min(...c.map(price)));
    const all = stands.map(price);
    expect(a.map(price)).toContain(Math.min(...all));
    expect(c.map(price)).toContain(Math.max(...all));
  });

  it("ignores stands without a size", () => {
    const withUnknown = [...stands, { standNumber: "9999", sizeSqm: null }];
    expect(filterByBand(withUnknown, "A").find((s) => s.standNumber === "9999")).toBeUndefined();
  });
});
