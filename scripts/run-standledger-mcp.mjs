/**
 * Run the StandLedger MCP handler in-process.
 * Uses LOVABLE_API_KEY from the environment, or a local test key.
 */
import { createMcpFetchHandler } from "../src/lib/mcp/edge-serve.ts";

const key = process.env.LOVABLE_API_KEY || "lov_local_test_key";
if (!process.env.LOVABLE_API_KEY) {
  process.env.LOVABLE_API_KEY = key;
  console.log("LOVABLE_API_KEY was unset; using a local test key (not production).");
} else {
  console.log("LOVABLE_API_KEY is set from the environment.");
}

const handler = createMcpFetchHandler();
const base = "https://gumkxjeahojrcaqnosyz.supabase.co/functions/v1/mcp";
let sessionId = "";

async function rpc(method, params, id = 1) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${key}`,
    "Lovable-API-Key": key,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const response = await handler(
    new Request(base, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
  );

  const nextSession = response.headers.get("mcp-session-id");
  if (nextSession) sessionId = nextSession;

  const raw = await response.text();
  let body = raw;
  if (raw.startsWith("event:") || raw.includes("data:")) {
    const dataLine = raw
      .split("\n")
      .find((line) => line.startsWith("data:"));
    body = dataLine ? dataLine.slice(5).trim() : raw;
  }

  let parsed = body;
  try {
    parsed = JSON.parse(body);
  } catch {
    // keep raw
  }

  return {
    status: response.status,
    sessionId,
    body: parsed,
  };
}

const initialize = await rpc("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "standledger-runner", version: "1.0.0" },
});
console.log("initialize", JSON.stringify({ status: initialize.status, body: initialize.body }, null, 2));
if (initialize.status >= 400 || initialize.body?.error) {
  process.exitCode = 1;
}

await rpc("notifications/initialized", {}, null);

const tools = await rpc("tools/list", {});
const toolNames = (tools.body?.result?.tools ?? []).map((tool) => tool.name);
console.log("tools/list", JSON.stringify({ status: tools.status, tools: toolNames }, null, 2));
if (!toolNames.includes("get_my_profile")) {
  process.exitCode = 1;
}

const profile = await rpc("tools/call", { name: "get_my_profile", arguments: {} }, 3);
const profileText = profile.body?.result?.content?.[0]?.text ?? profile.body;
console.log("get_my_profile", JSON.stringify({ status: profile.status, text: profileText }, null, 2));
if (!String(profileText).includes("LOVABLE_API_KEY")) {
  process.exitCode = 1;
}

if (process.exitCode) {
  console.error("MCP run failed");
} else {
  console.log("MCP run ok");
}
