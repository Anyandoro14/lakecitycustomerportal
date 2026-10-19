/**
 * Minimal OTLP/HTTP JSON trace exporter for Supabase Edge Functions.
 * Inert when OTEL_EXPORTER_OTLP_ENDPOINT is unset (no network, no throw).
 *
 * Span attributes: function name, status, duration only.
 * Never records request/response bodies or client IP / user-agent.
 */

const OTEL_ENDPOINT = () =>
  (Deno.env.get("OTEL_EXPORTER_OTLP_ENDPOINT") || "").trim().replace(/\/+$/, "");
const OTEL_HEADERS = () => (Deno.env.get("OTEL_EXPORTER_OTLP_HEADERS") || "").trim();

/** Keys that must never appear on exported spans (STATUTE / UK). */
export const OTEL_FORBIDDEN_ATTR_KEYS = [
  "client.address",
  "http.client_ip",
  "net.peer.ip",
  "net.sock.peer.addr",
  "net.host.ip",
  "user_agent.original",
  "http.user_agent",
  "user_agent",
  "http.request.body",
  "http.response.body",
  "http.request.body.content",
  "http.response.body.content",
] as const;

const FORBIDDEN = new Set<string>(
  OTEL_FORBIDDEN_ATTR_KEYS.map((k) => k.toLowerCase()),
);

export type OtelAttr = {
  key: string;
  value: { stringValue?: string; intValue?: number; doubleValue?: number };
};

export function scrubOtelSpanAttributes(attrs: OtelAttr[]): OtelAttr[] {
  return attrs.filter((a) => {
    const key = (a.key || "").toLowerCase();
    if (FORBIDDEN.has(key)) return false;
    if (key.includes("user_agent")) return false;
    if (key.endsWith(".ip") || key.includes("client_ip") || key.includes("peer.ip")) {
      return false;
    }
    if (key.includes("request.body") || key.includes("response.body")) return false;
    return true;
  });
}

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
  const parts = header.trim().split("-");
  if (parts.length < 4) return null;
  const [, traceId, parentSpanId] = parts;
  if (!traceId || traceId.length !== 32 || !parentSpanId || parentSpanId.length !== 16) {
    return null;
  }
  return { traceId, parentSpanId };
}

function hrTimeNanos(): string {
  return String(Date.now() * 1_000_000);
}

function buildSafeSpanAttributes(
  name: string,
  statusCode: number,
  durationMs: number,
): OtelAttr[] {
  // Only allow-listed fields — never IP, UA, or bodies.
  return scrubOtelSpanAttributes([
    { key: "faas.name", value: { stringValue: name } },
    { key: "http.status_code", value: { intValue: statusCode } },
    { key: "duration_ms", value: { doubleValue: durationMs } },
  ]);
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
                attributes: buildSafeSpanAttributes(
                  payload.name,
                  payload.statusCode,
                  payload.durationMs,
                ),
                status: {
                  code: payload.ok ? 1 : 2,
                },
              },
            ],
          },
        ],
      },
    ],
  };

  try {
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
 * Does not read request/response bodies for tracing.
 * Does not attach client IP or User-Agent from the request.
 */
export function withOtel(functionName: string, handler: TracedHandler): TracedHandler {
  return async (req: Request) => {
    const start = Date.now();
    const startNano = hrTimeNanos();
    // Only W3C trace context — never x-forwarded-for / user-agent.
    const incoming = parseTraceparent(req.headers.get("traceparent"));
    const traceId = incoming?.traceId ?? hexId(16);
    const spanId = hexId(8);
    const parentSpanId = incoming?.parentSpanId;

    let response: Response;
    try {
      response = await handler(req);
    } catch (err) {
      const durationMs = Date.now() - start;
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
