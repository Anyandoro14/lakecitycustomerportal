import assert from "node:assert/strict";
import {
  presentedLovableApiKey,
  requestHasLovableApiKey,
  timingSafeEqualString,
} from "../src/lib/mcp/lovable-api-key.ts";

assert.equal(timingSafeEqualString("abc", "abc"), true);
assert.equal(timingSafeEqualString("abc", "abd"), false);
assert.equal(timingSafeEqualString("abc", "ab"), false);
assert.equal(timingSafeEqualString("", ""), true);

const bearerReq = new Request("https://example.test/mcp", {
  headers: { Authorization: "Bearer lov_test_key" },
});
assert.equal(presentedLovableApiKey(bearerReq), "lov_test_key");
assert.equal(requestHasLovableApiKey(bearerReq, "lov_test_key"), true);
assert.equal(requestHasLovableApiKey(bearerReq, "lov_other"), false);

const headerReq = new Request("https://example.test/mcp", {
  headers: { "Lovable-API-Key": "lov_header_key" },
});
assert.equal(presentedLovableApiKey(headerReq), "lov_header_key");
assert.equal(requestHasLovableApiKey(headerReq, "lov_header_key"), true);

const emptyReq = new Request("https://example.test/mcp");
assert.equal(requestHasLovableApiKey(emptyReq, "lov_test_key"), false);
assert.equal(requestHasLovableApiKey(bearerReq, ""), false);

console.log("mcp lovable-api-key helper: ok");
