/**
 * Paynow relay — Cloudflare Worker (also runnable locally via
 * `npm run paynow-relay:local`).
 *
 * Why: Paynow resets connections from Supabase Edge Function egress IPs.
 * This Worker sits on Cloudflare's network, receives our signed form
 * request, and forwards it verbatim to Paynow.
 *
 * Deploy: see docs/PAYNOW_RELAY.md
 *
 * Auth: RELAY_SECRET is required. Edge Functions send it as X-Relay-Secret
 * (PAYNOW_PROXY_SECRET). The Worker only allows https://(www.)paynow.co.zw.
 */

const ALLOWED_HOSTS = new Set(["paynow.co.zw", "www.paynow.co.zw"]);

const PAYNOW_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  Accept: "*/*",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function allowedTarget(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;
  return url;
}

export default {
  async fetch(request, env = {}) {
    if (request.method === "GET" || request.method === "HEAD") {
      const target = request.headers.get("X-Paynow-Target");
      if (!target) {
        return json(200, { ok: true, service: "lakecity-paynow-relay" });
      }
    }

    if (request.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    if (!env.RELAY_SECRET) {
      return json(500, { error: "Relay not configured" });
    }
    if (request.headers.get("X-Relay-Secret") !== env.RELAY_SECRET) {
      return json(403, { error: "Forbidden" });
    }

    const rawTarget = request.headers.get("X-Paynow-Target");
    if (!rawTarget) return json(400, { error: "Missing X-Paynow-Target" });

    const url = allowedTarget(rawTarget);
    if (!url) return json(400, { error: "Target not allowed" });

    const body = await request.text();
    const upstreamMethod = body ? "POST" : "GET";

    const upstream = await fetch(url.toString(), {
      method: upstreamMethod,
      headers: PAYNOW_HEADERS,
      ...(body ? { body } : {}),
      redirect: "follow",
    });

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
