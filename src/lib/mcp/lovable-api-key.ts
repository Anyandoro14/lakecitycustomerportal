/** Compare two strings in roughly constant time. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  const max = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;
  for (let i = 0; i < max; i++) {
    mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return mismatch === 0;
}

export function readLovableApiKeyFromEnv(): string {
  try {
    const deno = (globalThis as { Deno?: { env?: { get?: (name: string) => string | undefined } } }).Deno;
    const fromDeno = deno?.env?.get?.("LOVABLE_API_KEY");
    if (fromDeno) return fromDeno;
  } catch {
    // Not a Deno runtime, or env access is denied.
  }
  return (typeof process !== "undefined" ? process.env.LOVABLE_API_KEY : undefined) ?? "";
}

export function presentedLovableApiKey(request: Request): string {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.match(/^Bearer\s+(\S+)/i)?.[1] ?? "";
  const header =
    request.headers.get("lovable-api-key") ??
    request.headers.get("x-lovable-api-key") ??
    "";
  return (bearer || header).trim();
}

export function requestHasLovableApiKey(
  request: Request,
  expected = readLovableApiKeyFromEnv(),
): boolean {
  if (!expected) return false;
  const presented = presentedLovableApiKey(request);
  if (!presented) return false;
  return timingSafeEqualString(presented, expected);
}
