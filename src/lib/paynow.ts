export const isPaynowEnabled = (): boolean =>
  import.meta.env.VITE_ENABLE_PAYNOW !== "false";

export const parseMoney = (value: string | number | null | undefined): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const num = parseFloat(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(num) ? num : 0;
};

export const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export type PaynowAmountCheck = {
  ok: boolean;
  amount: number;
  error?: string;
};

/** Free-text amount: at least min instalment, at most outstanding balance. */
export const validatePaynowAmount = (
  raw: string,
  minInstalment: number,
  outstandingBalance: number,
): PaynowAmountCheck => {
  const amount = roundMoney(parseMoney(raw));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, amount, error: "Enter a payment amount" };
  }
  if (outstandingBalance <= 0) {
    return { ok: false, amount, error: "This stand has no outstanding balance" };
  }
  const min = roundMoney(Math.min(minInstalment > 0 ? minInstalment : amount, outstandingBalance));
  const max = roundMoney(outstandingBalance);
  if (amount + 1e-6 < min) {
    return { ok: false, amount, error: `Minimum payment is $${min.toFixed(2)}` };
  }
  if (amount - 1e-6 > max) {
    return { ok: false, amount, error: `Amount cannot exceed the outstanding balance of $${max.toFixed(2)}` };
  }
  return { ok: true, amount };
};

export const normalizeZwMobile = (phone: string): string | null => {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;
  let local = digits;
  if (local.startsWith("263")) local = `0${local.slice(3)}`;
  if (local.length === 9 && local.startsWith("7")) local = `0${local}`;
  if (!/^0(7[1-8]|86)\d{7}$/.test(local)) return null;
  return local;
};
