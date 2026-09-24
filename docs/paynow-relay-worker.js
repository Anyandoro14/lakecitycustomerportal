/**
 * Paynow relay — Cloudflare Worker.
 *
 * Why: Paynow blocks our hosting provider's outbound IPs. This Worker sits in
 * front of Paynow, receives our signed form request and forwards it verbatim.
 *
 * Deploy:
 *   1. Cloudflare dashboard > Workers & Pages > Create > Worker.
 *   2. Paste this file as the Worker code and Deploy.
 *   3. Settings > Variables > add a secret RELAY_SECRET (any long random string).
 *   4. Copy the Worker URL (https://<name>.<account>.workers.dev).
 *
 * Then give the URL and the RELAY_SECRET value back to Lovable so they can be
 * stored as the PAYNOW_PROXY_URL and PAYNOW_PROXY_SECRET backend secrets.
 */

const ALLOWED_HOSTS = ["paynow.co.zw", "www.paynow.co.zw"];

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (env.RELAY_SECRET && request.headers.get("X-Relay-Secret") !== env.RELAY_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    const target = request.headers.get("X-Paynow-Target");
    if (!target) return new Response("Missing X-Paynow-Target", { status: 400 });

    let url;
    try {
      url = new URL(target);
    } catch {
      return new Response("Bad target", { status: 400 });
    }
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.includes(url.hostname)) {
      return new Response("Target not allowed", { status: 400 });
    }

    const body = await request.text();

    const upstream = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "*/*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      body,
      redirect: "follow",
    });

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
