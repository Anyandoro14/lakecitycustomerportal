/**
 * Minimal OTLP/HTTP JSON trace exporter for Supabase Edge Functions.
 * Inert when OTEL_EXPORTER_OTLP_ENDPOINT is unset (no network, no throw).
 *
 * Span attributes: function name, status, duration only — never request bodies
 * or user data.
 */

const OTEL_ENDPOINT = () =>
  (Deno.env.get("OTEL_EXPORTER_OTLP_ENDPOINT") || "").trim().replace(/\/+$/, "");
const OTEL_HEADERS = () => (Deno.env.get("OTEL_EXPORTER_OTLP_HEADERS") || "").trim();

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = { "Content-Type": "application/json" };
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function hexId(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseTraceparent(header: string | null): { traceId: string; parentSpanId: string } | null {
  if (!header) return null;
  // version-traceid-spanid-flags
  const parts = header.trim().split("-");
  if (parts.length < 4) return null;
  const [, traceId, parentSpanId] = parts;
  if (!traceId || traceId.length !== 32 || !parentSpanId || parentSpanId.length !== 16) {
    return null;
  }
  return { traceId, parentSpanId };
}

function hrTimeNanos(): string {
  // OTLP expects unix nano as string/number. Deno Date is ms-precision; pad.
  return String(Date.now() * 1_000_000);
}

async function exportSpan(payload: {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startNano: string;
  endNano: string;
  statusCode: number;
  durationMs: number;
  ok: boolean;
}): Promise<void> {
  const endpoint = OTEL_ENDPOINT();
  if (!endpoint) return;

  const url = endpoint.endsWith("/v1/traces")
    ? endpoint
    : `${endpoint}/v1/traces`;

  const body = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "lakecity-edge-functions" } },
            { key: "deployment.environment", value: { stringValue: "supabase" } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "lakecity-otel", version: "1.0.0" },
            spans: [
              {
                traceId: payload.traceId,
                spanId: payload.spanId,
                parentSpanId: payload.parentSpanId || undefined,
                name: payload.name,
                kind: 2, // SERVER
                startTimeUnixNano: payload.startNano,
                endTimeUnixNano: payload.endNano,
                attributes: [
                  { key: "faas.name", value: { stringValue: payload.name } },
                  { key: "http.status_code", value: { intValue: payload.statusCode } },
                  { key: "duration_ms", value: { doubleValue: payload.durationMs } },
                ],
                status: {
                  code: payload.ok ? 1 : 2, // OK | ERROR
                },
              },
            ],
          },
        ],
      },
    ],
  };

  try {
    // Fire-and-forget with a short timeout so we never block the response path long.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    await fetch(url, {
      method: "POST",
      headers: parseHeaders(OTEL_HEADERS()),
      body: JSON.stringify(body),
      signal: controller.signal,
    }).catch(() => undefined);
    clearTimeout(timer);
  } catch {
    /* never fail the request for telemetry */
  }
}

export type TracedHandler = (req: Request) => Promise<Response> | Response;

/**
 * Wrap an edge-function handler with a single SERVER span.
 * Reads incoming traceparent when present; otherwise starts a new trace.
 */
export function withOtel(functionName: string, handler: TracedHandler): TracedHandler {
  return async (req: Request) => {
    const start = Date.now();
    const startNano = hrTimeNanos();
    const incoming = parseTraceparent(req.headers.get("traceparent"));
    const traceId = incoming?.traceId ?? hexId(16);
    const spanId = hexId(8);
    const parentSpanId = incoming?.parentSpanId;

    let response: Response;
    try {
      response = await handler(req);
    } catch (err) {
      const durationMs = Date.now() - start;
      // Do not await — keep failure path fast; still best-effort export.
      void exportSpan({
        traceId,
        spanId,
        parentSpanId,
        name: functionName,
        startNano,
        endNano: hrTimeNanos(),
        statusCode: 500,
        durationMs,
        ok: false,
      });
      throw err;
    }

    const durationMs = Date.now() - start;
    const statusCode = response.status;
    void exportSpan({
      traceId,
      spanId,
      parentSpanId,
      name: functionName,
      startNano,
      endNano: hrTimeNanos(),
      statusCode,
      durationMs,
      ok: statusCode < 500,
    });

    return response;
  };
}

/** CORS allow-headers addition for W3C trace context propagation. */
export const OTEL_CORS_HEADERS =
  "traceparent, tracestate, baggage";
