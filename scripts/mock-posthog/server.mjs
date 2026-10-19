#!/usr/bin/env node
/**
 * Local PostHog stand-in — never contacts real PostHog.
 * Logs every request path for opt-out evidence.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.MOCK_POSTHOG_PORT || 8799);
const LOG_PATH =
  process.env.MOCK_POSTHOG_LOG ||
  "/opt/cursor/artifacts/opt-out-mock-posthog.log";

const logLines = [];

function log(line) {
  const entry = `[${new Date().toISOString()}] ${line}`;
  logLines.push(entry);
  console.log(entry);
  try {
    fs.appendFileSync(LOG_PATH, entry + "\n");
  } catch {
    /* ignore */
  }
}

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
fs.writeFileSync(LOG_PATH, `# mock PostHog log started ${new Date().toISOString()}\n`);

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const len = body.length;
    log(`${req.method} ${req.url} bytes=${len}`);
    // CORS for browser
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    if (req.method === "OPTIONS") {
      res.end("");
      return;
    }
    // Minimal decide / config responses PostHog-js tolerates
    if ((req.url || "").includes("/decide")) {
      res.end(JSON.stringify({ config: { enable_collect_everything: false }, featureFlags: {} }));
      return;
    }
    res.end(JSON.stringify({ status: 1 }));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  log(`listening on http://127.0.0.1:${PORT}`);
});
