// Same customer-facing strings as src/lib/stand-sales/office.ts.
// Edge functions cannot import the Vite app module. A unit test keeps the two copies equal.

/** Pending Alex/conveyancer spelling sign-off. Recent letterheads and Agreements of Sale use "Domboshava"; the 2 Jun 2026 company-address change and some older mandates use "Domboshawa". */
export const HARE_OFFICE_ADDRESS = "128 Domboshava Road, Borrowdale, Harare";

/** UNVERIFIED — confirm with Alex before publish. Buyer-facing copy must not include these hours until HARE_OFFICE_HOURS_CONFIRMED is true. */
export const HARE_OFFICE_HOURS = "Monday–Friday, 08:00–16:30";

/** Hours stay off buyer-facing copy until Alex confirms them. */
export const HARE_OFFICE_HOURS_CONFIRMED = false;

/** Already the from/sign-off address in supabase/functions/_shared/stand-sales-email.ts. Confirm with Alex whether legal@ and/or sales@ should also be queued on agreement alerts. */
export const STAFF_AGREEMENT_NOTIFY_EMAIL = "accounts@lakecity.co.zw";

/** Review placeholder only. Not a customer Agreement of Sale PDF. */
export const AGREEMENT_REVIEW_DOCUMENT_URL = "https://example.invalid/lakecity/agreement-of-sale-placeholder";

export const AGREEMENT_REVIEW_DOCUMENT_LABEL = "Agreement of Sale (placeholder for review)";

export function inPersonSigningLine(): string {
  const line = `Sign in person at the LakeCity Harare office at ${HARE_OFFICE_ADDRESS}`;
  if (!HARE_OFFICE_HOURS_CONFIRMED) return line;
  return `${line} (${HARE_OFFICE_HOURS})`;
}
