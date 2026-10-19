/**
 * One-way identify: SHA-256(internalUserId + static salt).
 * Never pass email, name, phone, stand/account numbers, or amounts.
 */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Browser / Web Crypto SHA-256 hex digest. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

/**
 * Build the PostHog distinct_id from an internal user id + salt.
 * Returns null when inputs are missing (caller must not identify).
 */
export async function hashUserIdForTelemetry(
  internalUserId: string | null | undefined,
  salt: string | null | undefined,
): Promise<string | null> {
  const id = (internalUserId ?? "").trim();
  const s = (salt ?? "").trim();
  if (!id || !s) return null;
  return sha256Hex(`${id}${s}`);
}
