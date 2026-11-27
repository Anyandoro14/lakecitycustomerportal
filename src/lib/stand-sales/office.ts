/** Confirmed by Alex, 27 Nov 2026. */
export const HARE_OFFICE_ADDRESS = "128 Domboshava Road, Borrowdale, Harare";

/** UNVERIFIED — confirm with Alex before publish. Buyer-facing copy must not include these hours until HARE_OFFICE_HOURS_CONFIRMED is true. */
export const HARE_OFFICE_HOURS = "Monday–Friday, 08:00–16:30";

/** Hours stay off buyer-facing copy until Alex confirms them. */
export const HARE_OFFICE_HOURS_CONFIRMED = false;

/** Confirmed by Alex, 27 Nov 2026. Sole staff inbox for agreement alerts. */
export const STAFF_AGREEMENT_NOTIFY_EMAIL = "accounts@lakecity.co.zw";

/** Confirmed by Alex, 27 Nov 2026. Signed wet-signature packs are delivered and returned here. Do not add a phone number or email for the firm. */
export const AGREEMENT_RETURN_ADDRESS = "Chigwanda Legal Practitioners, No. 49 The Chase, Mount Pleasant, Harare";

/** Review placeholder only. Not a customer Agreement of Sale PDF. */
export const AGREEMENT_REVIEW_DOCUMENT_URL = "https://example.invalid/agreement-of-sale-placeholder";

export const AGREEMENT_REVIEW_DOCUMENT_LABEL = "Agreement of Sale (placeholder for review)";

export function inPersonSigningLine(): string {
  const line = `Sign in person at the LakeCity Harare office at ${HARE_OFFICE_ADDRESS}`;
  if (!HARE_OFFICE_HOURS_CONFIRMED) return line;
  return `${line} (${HARE_OFFICE_HOURS})`;
}

export function agreementReturnLine(): string {
  return `Send the signed original back to ${AGREEMENT_RETURN_ADDRESS}.`;
}
