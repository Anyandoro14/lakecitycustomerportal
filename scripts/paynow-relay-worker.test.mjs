import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../docs/paynow-relay-worker.js";

const env = { RELAY_SECRET: "test-secret" };

function req(path, { method = "POST", headers = {}, body } = {}) {
  return new Request(`https://relay.test${path}`, { method, headers, body });
}

test("GET / is a health check", async () => {
  const res = await worker.fetch(req("/", { method: "GET" }), env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "lakecity-paynow-relay");
});

test("rejects missing relay secret", async () => {
  const res = await worker.fetch(
    req("/", {
      headers: { "X-Paynow-Target": "https://www.paynow.co.zw/interface/initiatetransaction" },
      body: "id=1",
    }),
    env,
  );
  assert.equal(res.status, 403);
});

test("rejects unconfigured worker", async () => {
  const res = await worker.fetch(
    req("/", {
      headers: {
        "X-Paynow-Target": "https://www.paynow.co.zw/interface/initiatetransaction",
        "X-Relay-Secret": "test-secret",
      },
      body: "id=1",
    }),
    {},
  );
  assert.equal(res.status, 500);
});

test("blocks non-Paynow hosts", async () => {
  const res = await worker.fetch(
    req("/", {
      headers: {
        "X-Paynow-Target": "https://evil.example/steal",
        "X-Relay-Secret": "test-secret",
      },
      body: "x=1",
    }),
    env,
  );
  assert.equal(res.status, 400);
});

test("forwards POST to an allowed Paynow host", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("status=Error&error=Invalid Hash", { status: 200 });
  };
  try {
    const res = await worker.fetch(
      req("/", {
        headers: {
          "X-Paynow-Target": "https://www.paynow.co.zw/interface/initiatetransaction",
          "X-Relay-Secret": "test-secret",
        },
        body: "id=1",
      }),
      env,
    );
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "status=Error&error=Invalid Hash");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://www.paynow.co.zw/interface/initiatetransaction");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.body, "id=1");
  } finally {
    globalThis.fetch = original;
  }
});

test("empty body polls Paynow with GET", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, hasBody: Boolean(init.body) });
    return new Response("status=Created", { status: 200 });
  };
  try {
    const res = await worker.fetch(
      req("/", {
        headers: {
          "X-Paynow-Target": "https://www.paynow.co.zw/interface/polltransaction?guid=abc",
          "X-Relay-Secret": "test-secret",
        },
        body: "",
      }),
      env,
    );
    assert.equal(res.status, 200);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].hasBody, false);
  } finally {
    globalThis.fetch = original;
  }
});
