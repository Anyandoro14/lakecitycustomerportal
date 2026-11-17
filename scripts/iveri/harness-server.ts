// Local Staging harness: runs the real _shared/iveri.ts core + Odoo recorder against
// the iVeri TEST environment, with a file-backed store and a mock Odoo-Staging JSON-RPC
// (synthetic stands only). Only the TEST App ID is loaded; the Live ID never enters this process.
import http from "node:http";
import fs from "node:fs";
import { loadIveriConfig, initOrder, handleReturn, sweep, redact, type Order, type Store, type Deps } from "../../supabase/functions/_shared/iveri.ts";
import { odooPendingRecorder } from "../../supabase/functions/_shared/iveri-odoo.ts";

const PORT = Number(process.env.PORT || 8787);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = (process.env.IVERI_HARNESS_DATA || new URL("./.harness-data/", import.meta.url).pathname);
const secrets: Record<string, string> = {};
for (const l of fs.readFileSync(process.env.IVERI_ENV_FILE || "/home/box/secrets/iveri.env", "utf8").split("\n")) {
  const m = /^(IVERI_TEST_APP_ID)=(.*)$/.exec(l.trim()); // Live ID deliberately NOT loaded
  if (m) secrets[m[1]] = m[2];
}
const env: Record<string, string | undefined> = {
  IVERI_ENV: "test",
  IVERI_GATEWAY_HOST: process.env.IVERI_GATEWAY_HOST || "portal.host.iveri.com",
  IVERI_CURRENCY: process.env.IVERI_CURRENCY || "USD",
  IVERI_TOKEN_VERIFICATION: process.env.IVERI_TOKEN_VERIFICATION || "off",
  IVERI_SHARED_SECRET: process.env.IVERI_SHARED_SECRET,
  IVERI_RETURN_BASE_URL: `${BASE}/iveri-return`,
  IVERI_PORTAL_BASE_URL: BASE,
  IVERI_ABANDON_AFTER_MINUTES: process.env.IVERI_ABANDON_AFTER_MINUTES || "60",
  ...secrets,
};
const cfg = loadIveriConfig((k) => env[k]);

// ---- file store
const F = DATA + "orders.json";
const load = (): Order[] => (fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, "utf8")) : []);
const save = (o: Order[]) => fs.writeFileSync(F, JSON.stringify(o, null, 1));
const store: Store = {
  async nextSeq(stand) { return load().filter((o) => o.stand === stand).length + 1; },
  async findByIdempotencyKey(k) { return load().find((o) => o.idempotencyKey === k) ?? null; },
  async insert(o) { const a = load(); if (a.some((x) => x.reference === o.reference)) throw new Error("duplicate reference"); a.push(o); save(a); },
  async getByReference(r) { return load().find((o) => o.reference === r) ?? null; },
  async getByTrace(t) { return load().find((o) => o.trace === t) ?? null; },
  async transition(r, exp, patch) { const a = load(); const o = a.find((x) => x.reference === r); if (!o || o.state !== exp) return null; Object.assign(o, patch); save(a); return o; },
  async update(r, patch) { const a = load(); const o = a.find((x) => x.reference === r); if (o) { Object.assign(o, patch); save(a); } },
  async listInitiatedOlderThan(c) { return load().filter((o) => o.state === "initiated" && o.createdAt <= c); },
  async listNeedingOdoo() { return load().filter((o) => o.state === "approved_pending_recon" && (o.flags ?? []).includes("odoo_record_pending")); },
};

// ---- mock Odoo Staging (synthetic contracts 9901..9910)
const OF = DATA + "odoo_staging_mock.json";
const odooLoad = () => (fs.existsSync(OF) ? JSON.parse(fs.readFileSync(OF, "utf8")) : { intakes: [], calls: [] });
const contracts = Array.from({ length: 10 }, (_, i) => ({ id: 500 + i, stand_number: String(9901 + i), partner_id: [7000 + i, `TEST Customer ${9901 + i}`] }));
function odooRpc(body: any) {
  const [, , , model, method, args, kwargs] = body.params.args;
  const db = odooLoad(); db.calls.push({ model, method }); let result: any;
  const dom = (args[0] ?? []) as any[];
  if (model === "lakecity.loan.contract" && method === "search_read") result = contracts.filter((c) => dom.every(([f, , v]) => (c as any)[f] === v)).slice(0, kwargs?.limit ?? 99);
  else if (model === "lakecity.receipt.intake" && method === "search_read") result = db.intakes.filter((c: any) => dom.every(([f, , v]: any) => c[f] === v)).slice(0, kwargs?.limit ?? 99);
  else if (model === "lakecity.receipt.intake" && method === "create") { const rec = { id: 9000 + db.intakes.length, state: "pending_qc", ...args[0] }; db.intakes.push(rec); result = rec.id; }
  else return { jsonrpc: "2.0", id: body.id, error: { message: `mock: ${model}.${method} not allowed` } };
  fs.writeFileSync(OF, JSON.stringify(db, null, 1));
  return { jsonrpc: "2.0", id: body.id, result };
}
const recorder = odooPendingRecorder({ url: `${BASE}/odoo-staging-mock`.replace("/odoo-staging-mock", ""), db: "lakecity-standledger-staging-mock", uid: 2, apiKey: "mock", receiptBaseUrl: `${BASE}/result/approved` },
  (u, i) => fetch(u, i as any) as any);

const deps: Deps = { cfg, store, recorder, fetch: (u, i) => fetch(u, i as any) as any, log: (m) => console.log(redact(cfg, m)) };

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const readBody = (req: http.IncomingMessage) => new Promise<string>((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
const html = (res: http.ServerResponse, s: string, code = 200) => { res.writeHead(code, { "Content-Type": "text/html" }); res.end(`<!doctype html><html><body>${s}</body></html>`); };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, BASE);
    if (req.method === "POST" && url.pathname === "/jsonrpc") { const b = JSON.parse(await readBody(req)); res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(odooRpc(b))); }
    if (req.method === "GET" && url.pathname === "/portal") {
      const q = url.searchParams; const key = crypto.randomUUID();
      const hidden = ["stand", "amount", "max", "email", "first", "last", "phone", "address", "city", "postal", "country"].map((k) => `<input type="hidden" name="${k}" value="${esc(q.get(k) ?? "")}">`).join("");
      return html(res, `<h1>Stand ${esc(q.get("stand") ?? "")}</h1><p>Amount due: $${esc(q.get("amount") ?? "")}</p>
<form id="pay" method="post" action="/init${q.get("manual") ? "?manual=1" : ""}">${hidden}<input type="hidden" name="idempotencyKey" value="${key}"><button id="pay-by-card" type="submit">Pay by card</button></form>`);
    }
    if (req.method === "POST" && url.pathname === "/init") {
      const p = Object.fromEntries(new URLSearchParams(await readBody(req)));
      try {
        const r = await initOrder(deps, { stand: p.stand, amount: p.amount, maxAmount: p.max || null, idempotencyKey: p.idempotencyKey,
          billing: { email: p.email, firstName: p.first, lastName: p.last, phone: p.phone, address: p.address, city: p.city, postalCode: p.postal, countryCode: p.country } });
        const inputs = Object.entries(r.fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join("");
        const auto = url.searchParams.get("manual") ? "" : `<script>document.getElementById('iv').submit()</script>`;
        return html(res, `<p id="ref">${r.order.reference}</p><p id="reused">${r.reused}</p><form id="iv" method="post" action="${r.action}">${inputs}<button id="go">Continue to secure payment</button></form>${auto}`);
      } catch (e) { return html(res, `<p id="init-error">${esc(String((e as Error).message))}</p>`, 400); }
    }
    const m = /^\/iveri-return\/(success|fail|trylater|error|cancel)$/.exec(url.pathname);
    if (m && req.method === "POST") {
      const p = Object.fromEntries(new URLSearchParams(await readBody(req)));
      fs.appendFileSync(DATA + "returns.log", JSON.stringify({ path: m[1], at: new Date().toISOString(), posted: Object.fromEntries(Object.entries(p).filter(([k]) => !/applicationid|token/i.test(k))) }) + "\n");
      const r = await handleReturn(deps, m[1], p);
      res.writeHead(303, { Location: `/result/${r.page}?ref=${encodeURIComponent(r.reference ?? "")}&state=${r.state}&recorded=${r.recorded}&note=${encodeURIComponent(r.note ?? "")}` });
      return res.end();
    }
    const rp = /^\/result\/(approved|declined|trylater|error|cancelled)$/.exec(url.pathname);
    if (rp) return html(res, `<div id="result" data-page="${rp[1]}" data-ref="${esc(url.searchParams.get("ref") ?? "")}" data-state="${esc(url.searchParams.get("state") ?? "")}">${rp[1]}</div>`);
    if (req.method === "POST" && url.pathname === "/sweep") { const ab = url.searchParams.get("abandon"); const r = await sweep(deps, Number(url.searchParams.get("older") ?? "15"), ab === null ? undefined : Number(ab)); res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(r)); }
    if (url.pathname === "/orders") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(load())); }
    if (url.pathname === "/odoo") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(odooLoad())); }
    html(res, "not found", 404);
  } catch (e) { console.error(redact(cfg, String(e))); html(res, `<p id="server-error">${esc(redact(cfg, String(e)))}</p>`, 500); }
}).listen(PORT, "127.0.0.1", () => console.log(`harness on ${BASE} env=${cfg.env} gateway=${cfg.gatewayHost} token=${cfg.tokenVerification}`));
