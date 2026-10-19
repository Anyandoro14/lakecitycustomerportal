/**
 * Privacy sanitizers for product telemetry.
 * Strips query/hash from URLs, masks emails, and redacts long digit runs.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
/** Runs of 6+ digits (account numbers, phones without formatting, refs, etc.) */
const LONG_DIGIT_RE = /\d{6,}/g;

export function scrubText(value: string): string {
  return value.replace(EMAIL_RE, "[email]").replace(LONG_DIGIT_RE, "[digits]");
}

/** Strip query string and hash fragment; scrub path of emails / long digits. */
export function sanitizeUrl(raw: string | undefined | null): string {
  if (!raw) return "";
  try {
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://portal.local";
    const u = new URL(raw, base);
    u.search = "";
    u.hash = "";
    u.pathname = scrubText(u.pathname);
    // Prefer path-only for same-origin style analytics; keep origin when absolute.
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      return `${u.pathname}${u.search}${u.hash}` || "/";
    }
    return u.toString();
  } catch {
    // Fallback: drop anything after ? or #
    const noQuery = raw.split("?")[0]?.split("#")[0] ?? "";
    return scrubText(noQuery);
  }
}

const URL_KEYS = new Set([
  "$current_url",
  "$pathname",
  "$referrer",
  "$referring_domain",
  "url",
  "pathname",
  "referrer",
  "href",
  "current_url",
]);

function sanitizeValue(key: string, value: unknown): unknown {
  if (typeof value === "string") {
    if (URL_KEYS.has(key) || key.endsWith("_url") || key === "$pathname") {
      return sanitizeUrl(value);
    }
    return scrubText(value);
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => sanitizeValue(String(i), v));
  }
  if (value && typeof value === "object") {
    return sanitizeProperties(value as Record<string, unknown>);
  }
  return value;
}

/** Deep-sanitize event property bags before they leave the browser. */
export function sanitizeProperties(
  properties: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!properties || typeof properties !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    // Never forward raw input values even if a library attaches them.
    if (
      key === "$input_value" ||
      key === "value" ||
      key === "password" ||
      key === "email" ||
      key === "phone" ||
      key === "amount" ||
      key === "stand_number" ||
      key === "account_number" ||
      key === "full_name" ||
      key === "name"
    ) {
      continue;
    }
    out[key] = sanitizeValue(key, value);
  }
  return out;
}

/** Scrub exception messages and stack traces for PostHog exception autocapture. */
export function scrubExceptionText(text: string | undefined | null): string {
  if (!text) return "";
  return scrubText(text);
}
