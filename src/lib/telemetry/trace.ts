/**
 * Lightweight W3C traceparent for correlating browser → edge function spans.
 * No user data. Safe to omit when telemetry is off.
 */

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type TraceContext = {
  traceparent: string;
  tracestate?: string;
};

/** Create a new sampled traceparent (version 00). */
export function createTraceparent(): TraceContext {
  const traceId = randomHex(16);
  const spanId = randomHex(8);
  // flags: sampled (01) so Grafana can keep the span when backend samples.
  return { traceparent: `00-${traceId}-${spanId}-01` };
}

/**
 * Headers to attach to Supabase function invokes on the payment path.
 * Returns empty object when crypto is unavailable (SSR / inert).
 */
export function paymentTraceHeaders(): Record<string, string> {
  try {
    if (typeof crypto === "undefined" || !crypto.getRandomValues) return {};
    const { traceparent } = createTraceparent();
    return {
      traceparent,
      // Empty tracestate / baggage allowed by CORS allow-list; keep minimal.
      tracestate: "",
      baggage: "",
    };
  } catch {
    return {};
  }
}
