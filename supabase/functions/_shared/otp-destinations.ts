// Shared helpers for resolving and validating 2FA destinations against the
// customer's stored profile. Destinations are NEVER taken from client input
// without being matched against the profile first.

export type OtpChannel = "sms" | "email";

/** Strip everything but digits so +263 77 123 4567 == 0263771234567 comparisons work. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  // Compare on the last 9 digits — covers +263/0/263 prefix variations.
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return na.length > 0 && na === nb;
}

export function normalizeEmail(raw: string | null | undefined): string {
  return (raw || "").trim().toLowerCase();
}

export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeEmail(a);
  const nb = normalizeEmail(b);
  return na.length > 0 && na === nb;
}

export function maskPhone(phone: string): string {
  if (!phone || phone.length < 5) return "***";
  return `${phone.slice(0, 3)}${"*".repeat(Math.max(0, phone.length - 5))}${phone.slice(-2)}`;
}

export function maskEmail(email: string): string {
  const [local, domain] = (email || "").split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

/** SHA-256 hex of salt + code. Codes themselves are never persisted or logged. */
export async function hashCode(code: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateNumericCode(length = 6): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((n) => (n % 10).toString()).join("");
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ProfileDestinations {
  email: string | null;
  phones: string[];
}

export async function loadProfileDestinations(
  supabaseAdmin: any,
  userId: string,
): Promise<ProfileDestinations | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email, phone_number, phone_number_2")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const phones: string[] = [];
  if (data.phone_number) phones.push(data.phone_number);
  if (data.phone_number_2) phones.push(data.phone_number_2);

  return { email: data.email ?? null, phones };
}
