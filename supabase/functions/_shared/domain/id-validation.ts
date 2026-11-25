// Identity-document validation shared by the browser (src/) and the Supabase edge functions (Deno).
// Keep this file dependency-free so it runs unchanged in both runtimes.
//
// These are FORMAT checks only. They prove a number is well-formed, not that it was issued to this
// person. Every ID still goes through the manual LakeCity staff review gate before payment.

import { isIsoCountry } from "./countries.ts";

export type IdType = "national_id" | "passport";

export const ID_TYPE_LABELS: Record<IdType, string> = {
  national_id: "National ID",
  passport: "Passport",
};

export interface IdentityInput {
  idType: IdType | "" | null | undefined;
  issuingCountry: string | null | undefined;
  idNumber: string | null | undefined;
  /** ISO date (YYYY-MM-DD). Required for passports, optional for national IDs. */
  expiryDate?: string | null;
}

export interface IdValidationResult {
  ok: boolean;
  normalized: string;
  /** Name of the rule that was applied, e.g. "ZW national ID (format + mod-23 check letter)". */
  rule: string;
  errors: Partial<Record<"idType" | "issuingCountry" | "idNumber" | "expiryDate", string>>;
}

export interface NationalIdRule {
  country: string;
  label: string;
  example: string;
  validate(normalized: string): string | null;
}

/** Upper-case and strip spaces, hyphens, slashes and dots. */
export function normalizeIdNumber(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[\s\-/.]/g, "");
}

// ---------------------------------------------------------------------------------------------
// Zimbabwe national ID
// Layout: RR-NNNNNN(N)-C-DD (hyphens optional), e.g. 63-446236 Z 61 / 63446236Z61.
//   RR  2-digit registration office code
//   N.. 6-7 digit sequential national number
//   C   check letter
//   DD  2-digit district of origin
// Check letter: integer(RR + N..) mod 23, mapped through "ZABCDEFGHJKLMNPQRSTVWXY" (I, O, U omitted).
// Source: Team Pachedu, "Zimbabwe 2018 Elections Biometric Voters' Roll Analysis" (16 July 2018),
//   section 4 and Appendix 2 ("MOD23"), https://www.kubatana.net/wp-content/uploads/2018/07/mainreport.pdf
//   The report applied the rule to all 5,683,936 IDs on the 2018 roll and found a single failure,
//   which turned out to be a typo (03-446236-Z61 for 63-446236-Z61). Also documented by
//   identique/idnumbers (src/countries/zwe, issue #277).
// Caveat: the Registrar-General has not published this rule as an official specification.
// ---------------------------------------------------------------------------------------------
const ZW_CHECK_LETTERS = "ZABCDEFGHJKLMNPQRSTVWXY";
const ZW_PATTERN = /^(\d{2})(\d{6,7})([A-Z])(\d{2})$/;

export function zimbabweCheckLetter(officeAndSerial: string): string {
  // Up to 9 digits: well inside Number.MAX_SAFE_INTEGER.
  return ZW_CHECK_LETTERS[Number(officeAndSerial) % 23];
}

const zimbabwe: NationalIdRule = {
  country: "ZW",
  label: "Zimbabwe national ID (format + mod-23 check letter)",
  example: "63-446236 Z 61",
  validate(n) {
    const m = ZW_PATTERN.exec(n);
    if (!m) {
      return "Zimbabwe ID must be 2 digits, 6-7 digits, a check letter and 2 digits (e.g. 63-446236Z61).";
    }
    const [, office, serial, letter] = m;
    const expected = zimbabweCheckLetter(office + serial);
    if (letter !== expected) {
      return "The check letter does not match the ID number. Please re-check the number on your ID.";
    }
    return null;
  },
};

// ---------------------------------------------------------------------------------------------
// South Africa national ID: 13 digits YYMMDD SSSS C A Z.
//   YYMMDD date of birth, SSSS gender sequence, C citizenship (0 citizen, 1 permanent resident,
//   2 refugee), A legacy digit, Z Luhn check digit over the first 12 digits.
// Sources: Identification Regulations, 1998 (Reg. R.978 under the Identification Act 68 of 1997),
//   regulation 3, https://www.polity.org.za/polity/govdocs/regulations/1998/reg98-0978.html
//   (layout; digit 13 is a "control figure"), and Wikipedia "South African identity card",
//   https://en.wikipedia.org/wiki/South_African_identity_card (control figure = Luhn; C=2 refugees).
// ---------------------------------------------------------------------------------------------
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const southAfrica: NationalIdRule = {
  country: "ZA",
  label: "South Africa ID (13 digits, date of birth + Luhn check digit)",
  example: "8001015009087",
  validate(n) {
    if (!/^\d{13}$/.test(n)) return "South African ID numbers are exactly 13 digits.";
    const mm = Number(n.slice(2, 4));
    const dd = Number(n.slice(4, 6));
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "The first 6 digits must be a valid date of birth (YYMMDD).";
    if (!["0", "1", "2"].includes(n[10])) return "Digit 11 (citizenship) must be 0, 1 or 2.";
    if (!luhnValid(n)) return "The check digit does not match. Please re-check the number.";
    return null;
  },
};

/**
 * Pluggable per-country national ID rules. To add a country, add a NationalIdRule here with a
 * cited source. Countries without a rule fall back to GENERIC_NATIONAL_ID.
 */
export const NATIONAL_ID_RULES: Record<string, NationalIdRule> = {
  [zimbabwe.country]: zimbabwe,
  [southAfrica.country]: southAfrica,
};

const GENERIC_NATIONAL_ID = {
  label: "Generic national ID (4-20 letters/digits)",
  validate(n: string): string | null {
    return /^[A-Z0-9]{4,20}$/.test(n) ? null : "ID number must be 4-20 letters or digits.";
  },
};

// Passports (any issuing country): 6-9 letters/digits after normalising, future expiry, issuing country.
const PASSPORT_RULE = {
  label: "Passport (6-9 letters/digits, future expiry)",
  validate(n: string): string | null {
    return /^[A-Z0-9]{6,9}$/.test(n) ? null : "Passport numbers are 6-9 letters or digits.";
  },
};

export function nationalIdRuleFor(country: string | null | undefined): NationalIdRule | undefined {
  return country ? NATIONAL_ID_RULES[country.toUpperCase()] : undefined;
}

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function validateIdentity(input: IdentityInput, now: Date = new Date()): IdValidationResult {
  const errors: IdValidationResult["errors"] = {};
  const normalized = normalizeIdNumber(input.idNumber);
  const country = (input.issuingCountry ?? "").toUpperCase();
  let rule = "";

  if (input.idType !== "national_id" && input.idType !== "passport") {
    errors.idType = "Choose National ID or Passport.";
  }
  if (!country) {
    errors.issuingCountry = "Issuing country is required.";
  } else if (!isIsoCountry(country)) {
    errors.issuingCountry = "Choose a valid issuing country.";
  }

  if (!normalized) {
    errors.idNumber = "ID number is required.";
  } else if (input.idType === "passport") {
    rule = PASSPORT_RULE.label;
    const e = PASSPORT_RULE.validate(normalized);
    if (e) errors.idNumber = e;
  } else if (input.idType === "national_id") {
    const specific = nationalIdRuleFor(country);
    rule = specific?.label ?? GENERIC_NATIONAL_ID.label;
    const e = (specific ?? GENERIC_NATIONAL_ID).validate(normalized);
    if (e) errors.idNumber = e;
  }

  const expiry = (input.expiryDate ?? "").trim();
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    errors.expiryDate = "Use the format YYYY-MM-DD.";
  } else if (input.idType === "passport" && !expiry) {
    errors.expiryDate = "Passport expiry date is required.";
  } else if (expiry && expiry <= todayIso(now)) {
    errors.expiryDate = "This document has expired. Please use a valid ID.";
  }

  return { ok: Object.keys(errors).length === 0, normalized, rule, errors };
}

/** Mask an ID number for display in lists/logs: keep the last 3 characters. */
export function maskIdNumber(n: string | null | undefined): string {
  const s = normalizeIdNumber(n);
  if (s.length <= 3) return "***";
  return "•".repeat(Math.min(s.length - 3, 8)) + s.slice(-3);
}
