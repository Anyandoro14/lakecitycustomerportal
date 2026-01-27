// Shared country helpers used across reporting.
// Normalizes messy inputs (ISO codes, phone numbers, dial codes) to ISO-ish 2-letter codes.

const DIAL_CODE_TO_ISO: Record<string, string> = {
  "+1": "US", // United States / Canada (default to US)
  "+27": "ZA", // South Africa
  "+44": "GB", // United Kingdom
  "+61": "AU", // Australia
  "+263": "ZW", // Zimbabwe
  "+260": "ZM", // Zambia
  "+267": "BW", // Botswana
  "+258": "MZ", // Mozambique
  "+351": "PT", // Portugal
};

// Minimal allowlist so we don’t accidentally “normalize” arbitrary strings.
const KNOWN_ISO: Record<string, true> = {
  ZW: true,
  GB: true,
  UK: true,
  AU: true,
  US: true,
  CA: true,
  ZA: true,
  NZ: true,
  IE: true,
  ZM: true,
  BW: true,
  MZ: true,
  PT: true,
  DE: true,
  FR: true,
  NL: true,
  AE: true,
  SG: true,
  HK: true,
  UNKNOWN: true,
};

/**
 * Normalize country code:
 * - Accepts ISO codes (e.g. "GB")
 * - Accepts messy strings that contain phone numbers (e.g. ";+4475...")
 * - Extracts dial codes and maps to ISO
 */
export const normalizeCountryCode = (rawCode: string): string => {
  if (!rawCode) return "UNKNOWN";

  const cleaned = rawCode.toUpperCase().trim();
  if (KNOWN_ISO[cleaned]) return cleaned;

  // Extract something that looks like a phone number from within the string.
  const phoneCandidate = cleaned.replace(/[^+0-9]/g, "");
  if (!phoneCandidate) return "UNKNOWN";

  const phoneClean = phoneCandidate.replace(/[\s\-\(\)]/g, "");
  const sortedDialCodes = Object.keys(DIAL_CODE_TO_ISO).sort((a, b) => b.length - a.length);

  for (const dialCode of sortedDialCodes) {
    const noPlus = dialCode.replace("+", "");
    if (phoneClean.startsWith(dialCode) || phoneClean.startsWith(noPlus)) {
      return DIAL_CODE_TO_ISO[dialCode];
    }
  }

  return "UNKNOWN";
};
