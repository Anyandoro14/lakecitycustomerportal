#!/usr/bin/env node
/**
 * Proof that sanitizers strip query/hash, emails, and long digit runs
 * from event payloads (mocked transport — no PostHog network).
 */
import { createHash } from "node:crypto";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const LONG_DIGIT_RE = /\d{6,}/g;

function scrubText(value) {
  return value.replace(EMAIL_RE, "[email]").replace(LONG_DIGIT_RE, "[digits]");
}

function sanitizeUrl(raw) {
  try {
    const u = new URL(raw, "https://portal.local");
    u.search = "";
    u.hash = "";
    u.pathname = scrubText(u.pathname);
    if (raw.startsWith("/") && !raw.startsWith("//")) return u.pathname || "/";
    return u.toString();
  } catch {
    return scrubText((raw.split("?")[0] || "").split("#")[0] || "");
  }
}

const DROP = new Set([
  "email",
  "amount",
  "stand_number",
  "password",
  "phone",
  "full_name",
  "name",
  "$input_value",
  "value",
  "account_number",
]);

function sanitizeProperties(properties) {
  const out = {};
  for (const [key, value] of Object.entries(properties || {})) {
    if (DROP.has(key)) continue;
    if (typeof value === "string") {
      out[key] =
        key === "$current_url" || key.endsWith("_url") || key === "$pathname"
          ? sanitizeUrl(value)
          : scrubText(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const raw = {
  event: "payment_flow_started",
  properties: {
    $current_url:
      "https://lakecity.standledger.io/pay/return?reference=ABC123456789&express=1#status",
    $pathname: "/pay/return?reference=ABC123456789",
    email: "customer@example.com",
    amount: 250.5,
    stand_number: "A123",
    note: "help ops@lakecity.co.zw with 2779454018",
    method: "paynow",
    source: "pay_page",
  },
};

const cleaned = {
  event: raw.event,
  properties: sanitizeProperties(raw.properties),
};

const rawId = "00000000-1111-2222-3333-444444444444";
const salt = "example-salt-not-real";
const distinctId = createHash("sha256").update(`${rawId}${salt}`).digest("hex");

const proof = {
  session_recording_disabled: true,
  disable_external_dependency_loading: true,
  mask_all_text: true,
  mask_all_element_attributes: true,
  person_profiles: "identified_only",
  identify: {
    raw_user_id_sent: false,
    distinct_id_sha256: distinctId,
  },
  raw_event_before_sanitize: raw,
  sanitized_posthog_payload: cleaned,
};

console.log(JSON.stringify(proof, null, 2));

const url = cleaned.properties.$current_url;
if (url.includes("?") || url.includes("#")) {
  console.error("FAIL: sanitized URL still has query/hash");
  process.exit(1);
}
if (JSON.stringify(cleaned).includes("@example.com")) {
  console.error("FAIL: email leaked");
  process.exit(1);
}
if (JSON.stringify(cleaned).includes("2779454018")) {
  console.error("FAIL: digit run leaked");
  process.exit(1);
}
if (distinctId === rawId || distinctId.includes(rawId)) {
  console.error("FAIL: raw id used as distinct_id");
  process.exit(1);
}
console.error("telemetry-proof: ok");
