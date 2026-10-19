/**
 * OTEL attribute scrubbing for UK privacy (STATUTE).
 * Never attach client IP, user-agent, or request/response bodies to spans.
 */

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

export type OtelAttr = { key: string; value: unknown };

/** Drop IP / UA / body attributes. Never add bodies here — callers must not record them. */
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
