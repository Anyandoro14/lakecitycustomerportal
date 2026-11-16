// Pure helper (no Deno APIs) so it can be unit-tested with vitest.
// Cleans a phone from the Collection Schedule or user input before it is
// compared or handed to Twilio Verify. Sheet cells often carry a leading
// apostrophe (text marker), spaces, dashes, dots or brackets.

const DEFAULT_COUNTRY_CODE = "263"; // Zimbabwe

/** Returns E.164 (+<digits>) or null when the value cannot be a valid number. */
export function normalizePhoneE164(raw: unknown, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  // Keep a single leading "+" if present; drop every other non-digit
  // (apostrophes, quotes, spaces, dashes, dots, brackets, NBSP, etc.).
  const hasPlus = /^[^0-9+]*\+/.test(s);
  let digits = s.replace(/\D/g, "");
  if (!digits) return null;
  if (!hasPlus) {
    if (digits.startsWith("00")) {
      digits = digits.slice(2);
    } else if (digits.startsWith("0")) {
      digits = countryCode + digits.slice(1);
    } else if (!digits.startsWith(countryCode) && digits.length <= 9) {
      digits = countryCode + digits;
    }
  }
  const e164 = "+" + digits;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}
