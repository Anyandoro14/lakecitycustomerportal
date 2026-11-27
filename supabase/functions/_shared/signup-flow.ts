/**
 * Pure signup helpers shared by validate-signup and register-user.
 * No secrets, no I/O. Safe to import from Vitest and from Deno edge functions.
 */

export const SIGNUP_PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export type SignupErrorBody = {
  success?: boolean;
  valid?: boolean;
  error: string;
  code: string;
  existingAccount?: boolean;
};

export function readSignupText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Same phone comparison validate-signup already used: drop spacing, and a local 0 becomes +263. */
export function normalizeSignupPhone(phone: string): string {
  return phone.replace(/[\s\-()]/g, "").replace(/^0/, "+263");
}

export function signupPhonesMatch(sheetPhone: string, inputPhone: string): boolean {
  const sheet = normalizeSignupPhone(sheetPhone);
  const input = normalizeSignupPhone(inputPhone);
  if (!sheet || !input) return false;
  return sheet.endsWith(input.slice(-9)) || input.endsWith(sheet.slice(-9)) || sheet === input;
}

export function normalizeSignupStand(stand: string): string {
  return stand.trim();
}

export function signupStandsMatch(left: string, right: string): boolean {
  return normalizeSignupStand(left).toLowerCase() === normalizeSignupStand(right).toLowerCase();
}

/**
 * Columns present on live public.profiles that signup is allowed to write.
 * Live has no tenant_id. payment_start_date is NOT NULL with a default, so it is omitted.
 */
export const LIVE_PROFILE_WRITE_COLUMNS = [
  "id",
  "email",
  "phone_number",
  "stand_number",
  "payment_plan_months",
] as const;

export function liveProfileWrite(input: {
  id: string;
  email: string;
  phoneNumber: string;
  standNumber: string;
  paymentPlanMonths: number;
}): Record<(typeof LIVE_PROFILE_WRITE_COLUMNS)[number], string | number> {
  return {
    id: input.id,
    email: input.email,
    phone_number: input.phoneNumber,
    stand_number: input.standNumber,
    payment_plan_months: input.paymentPlanMonths,
  };
}

export function signupAuthEmail(email: string | null | undefined, standNumber: string): string {
  const trimmed = (email ?? "").trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  const slug = normalizeSignupStand(standNumber).toLowerCase().replace(/[^a-z0-9]/g, "");
  return `stand-${slug}@lakecity.portal`;
}

export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  return trimmed.slice(at + 1);
}

export function phoneLast4(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

export type ColumnError = { code?: string | null; message?: string | null } | null | undefined;

/** PostgREST / Postgres signal that a filter referenced a column this database does not have. */
export function isMissingColumnError(error: ColumnError): boolean {
  if (!error) return false;
  const code = (error.code ?? "").toUpperCase();
  if (code === "42703" || code === "PGRST204") return true;
  const message = error.message ?? "";
  return /does not exist|schema cache|could not find the/i.test(message) &&
    /tenant_id|spreadsheet_id|display_name|column/i.test(message);
}

export type AuthAdminError = {
  message?: string | null;
  code?: string | null;
  status?: number | null;
};

export type MappedAuthError = {
  status: number;
  code: string;
  error: string;
};

const SCHEMA_MISMATCH_MESSAGE =
  "We couldn't create the account because the server is missing a required setting. Please contact LakeCity.";

/**
 * Map a GoTrue admin.createUser failure to a stable code.
 * Customer text stays short. The raw GoTrue message is for logs, not this string,
 * except where GoTrue's own message is already safe (password, already registered).
 */
export function mapAuthAdminCreateError(error: AuthAdminError): MappedAuthError {
  const message = (error.message ?? "").trim();
  const authCode = (error.code ?? "").toLowerCase();
  const status = error.status ?? null;

  if (
    isMissingColumnError(error) ||
    (/tenant_id|spreadsheet_id|display_name/i.test(message) &&
      /does not exist|undefined column|42703/i.test(message)) ||
    /relation ["']?(public\.)?(internal_users|profiles)["']? does not exist/i.test(message)
  ) {
    return { status: 500, code: "schema_mismatch", error: SCHEMA_MISMATCH_MESSAGE };
  }

  if (
    authCode === "email_exists" ||
    /email address has already been registered/i.test(message) ||
    /user already registered/i.test(message) ||
    (/duplicate key/i.test(message) && /email/i.test(message))
  ) {
    return {
      status: 409,
      code: "email_already_registered",
      error: "This email is already associated with another account.",
    };
  }

  if (
    authCode === "phone_exists" ||
    (/phone/i.test(message) && /already (registered|exists|been registered)/i.test(message)) ||
    (/duplicate key/i.test(message) && /phone/i.test(message))
  ) {
    return {
      status: 409,
      code: "phone_already_registered",
      error: "This phone number is already associated with another account.",
    };
  }

  if (
    authCode === "weak_password" ||
    ((status === 400 || status === 422) && /password/i.test(message))
  ) {
    return {
      status: 400,
      code: "password_policy",
      error: "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
    };
  }

  return {
    status: 500,
    code: "create_user_failed",
    error: "Failed to create account. Please try again.",
  };
}

const SECRET_ASSIGNMENT = /\b(password|secret|token|api[-_]?key|authorization)\b\s*[:=]\s*\S+/gi;
const BEARER = /Bearer\s+\S+/gi;

export function redactSignupLogText(value: string): string {
  return value
    .replace(SECRET_ASSIGNMENT, "$1=[redacted]")
    .replace(BEARER, "Bearer [redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .slice(0, 500);
}

export type SignupLogEvent = {
  fn: "register-user" | "validate-signup";
  request_id: string;
  step: string;
  stand_number: string | null;
  phone_last4: string | null;
  email_domain: string | null;
  status: number;
  error_code: string | null;
  error_message: string | null;
};

/** One JSON line. Phone is last-4 only, email is the domain only, and secrets are stripped. */
export function signupLogLine(event: SignupLogEvent): string {
  return JSON.stringify({
    fn: event.fn,
    request_id: event.request_id,
    step: event.step,
    stand_number: event.stand_number,
    phone_last4: event.phone_last4,
    email_domain: event.email_domain,
    status: event.status,
    error_code: event.error_code,
    error_message: event.error_message ? redactSignupLogText(event.error_message) : null,
  });
}

export function logSignupEvent(event: SignupLogEvent): void {
  console.log(signupLogLine(event));
}
