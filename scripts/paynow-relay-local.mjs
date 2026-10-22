#!/usr/bin/env node
/**
 * Run the Paynow relay Worker on Node for local / smoke tests.
 *   RELAY_SECRET=devsecret npm run paynow-relay:local
 */
import { createServer } from "node:http";
import worker from "../docs/paynow-relay-worker.js";

const port = Number(process.env.PORT || 8787);
const env = {
  RELAY_SECRET: process.env.RELAY_SECRET || process.env.PAYNOW_PROXY_SECRET || "",
};

if (!env.RELAY_SECRET) {
  console.error("Set RELAY_SECRET (same value as PAYNOW_PROXY_SECRET).");
  process.exit(1);
}

const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
    }
    const request = new Request(url, {
      method: req.method,
      headers,
      body: raw.length ? raw : undefined,
    });
    const response = await worker.fetch(request, env);
    const outHeaders = Object.fromEntries(response.headers);
    res.writeHead(response.status, outHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Paynow relay listening on http://127.0.0.1:${port}`);
});
