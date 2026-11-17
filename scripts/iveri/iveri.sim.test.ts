// Simulated-gateway suite: real core + real Odoo recorder; iVeri AuthoriseInfo and Odoo
// Staging are stubbed with the documented test-card outcomes. Runs as a customer in each
// of the real top-10 payer countries (fake example.com profiles). No network, no money.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { loadIveriConfig, initOrder, handleReturn, sweep, buildTransactionToken, buildReference, classifyStatus, type Order, type Store, type Deps } from "../../supabase/functions/_shared/iveri.ts";
import { odooPendingRecorder, assertStagingOdoo } from "../../supabase/functions/_shared/iveri-odoo.ts";

const FAKE_APP = "11111111-2222-3333-4444-555555555555"; // dummy, not a real App ID
const C = JSON.parse(fs.readFileSync(new URL("./top10_test_profiles.json", import.meta.url), "utf8"));
const prof = (country: string) => { const c = C.find((x: any) => x.country === country); const [first, ...rest] = c.test.name.split(" "); return { country, billing: { email: c.test.email, firstName: first, lastName: rest.join(" "), phone: c.test.phone, address: c.test.address.slice(0, 40) } }; };

// Documented iVeri test-card outcomes (non-3DS + 3DS2 MPIs)
const CARD: Record<string, { status: number; desc: string }> = {
  "4242424242424242": { status: 0, desc: "Approved" },
  "2121212121212121-3": { status: 3, desc: "Hot card" }, "2121212121212121-4": { status: 4, desc: "Denied" }, "2121212121212121-5": { status: 5, desc: "Call for approval" },
  "5454545454545454": { status: 9, desc: "Unable to process / timeout" },
  "4000000000000002": { status: 14, desc: "Invalid card" },
  "4070426536557386": { status: 0, desc: "Approved 3DS frictionless (Bankserv Visa)" }, "5189359787009697": { status: 0, desc: "Approved 3DS frictionless (Bankserv MC)" },
  "4069421358347845": { status: 4, desc: "3DS authentication failed (Bankserv Visa)" }, "5178872338408971": { status: 4, desc: "3DS authentication failed (Bankserv MC)" },
  "4070427646039018": { status: 0, desc: "Approved after 3DS challenge (Bankserv Visa)" }, "5189354281295934": { status: 0, desc: "Approved after 3DS challenge (Bankserv MC)" },
  "4456530000001005": { status: 0, desc: "Approved (CyberSource Visa)" }, "5200000000001005": { status: 0, desc: "Approved (CyberSource MC)" },
  "4456530000001013": { status: 4, desc: "3DS failed (CyberSource Visa)" }, "4456530000001096": { status: 0, desc: "Approved after step-up (CyberSource Visa)" },
  "expired": { status: 14, desc: "Invalid Expiry Date" },
};

function harness() {
  const orders: Order[] = []; const intakes: any[] = []; const gw = new Map<string, Record<string, string>>();
  const store: Store = {
    async nextSeq(st) { return orders.filter((o) => o.stand === st).length + 1; },
    async findByIdempotencyKey(k) { return orders.find((o) => o.idempotencyKey === k) ?? null; },
    async insert(o) { if (orders.some((x) => x.reference === o.reference)) throw new Error("dup"); orders.push(structuredClone(o)); },
    async getByReference(r) { return orders.find((o) => o.reference === r) ?? null; },
    async getByTrace(t) { return orders.find((o) => o.trace === t) ?? null; },
    async transition(r, e, p) { const o = orders.find((x) => x.reference === r); if (!o || o.state !== e) return null; Object.assign(o, p); return o; },
    async update(r, p) { const o = orders.find((x) => x.reference === r); if (o) Object.assign(o, p); },
    async listInitiatedOlderThan(c) { return orders.filter((o) => o.state === "initiated" && o.createdAt <= c); },
    async listNeedingOdoo() { return orders.filter((o) => o.state === "approved_pending_recon" && (o.flags ?? []).includes("odoo_record_pending")); },
  };
  let odooDown = false;
  const odooFetch = async (_u: string, i: any) => { const b = JSON.parse(i.body); const [, , , model, method, args] = b.params.args; let result: any;
    if (odooDown) return { status: 503, json: async () => ({ error: { message: "Odoo staging unavailable" } }) };
    if (model === "lakecity.loan.contract") result = [{ id: 1, partner_id: [77, "TEST"] }];
    else if (method === "search_read") result = intakes.filter((x) => x.intake_uuid === args[0][0][2]);
    else if (method === "create") { intakes.push({ id: intakes.length + 1, state: "pending_qc", ...args[0] }); result = intakes.length; }
    else return { status: 200, json: async () => ({ error: { message: `blocked ${model}.${method}` } }) };
    return { status: 200, json: async () => ({ result }) }; };
  const env: Record<string, string> = { IVERI_ENV: "test", IVERI_TEST_APP_ID: FAKE_APP, IVERI_RETURN_BASE_URL: "https://staging.example/functions/v1/iveri-return", IVERI_PORTAL_BASE_URL: "https://staging.example" };
  const cfg = loadIveriConfig((k) => env[k]);
  const fetch = async (_u: string, i: any) => { const p = new URLSearchParams(i.body); const r = gw.get(p.get("Lite_Merchant_Trace")!);
    const f = r ?? { Lite_Payment_Card_Status: "-255", Lite_Result_Description: "No Transaction found" };
    return { status: 200, text: async () => Object.entries(f).map(([k, v]) => `<input name="${k}" type="hidden" value="${v}">`).join("") }; };
  const deps: Deps = { cfg, store, fetch, recorder: odooPendingRecorder({ url: "https://lakecity-standledger-staging-40400050.dev.odoo.com", db: "lakecity-standledger-staging-40400050", uid: 2, apiKey: "x", receiptBaseUrl: "https://staging.example/pay/card/approved" }, odooFetch as any) };
  // Simulate iVeri processing a card: sets the gateway record and returns the browser POST fields.
  const pay = (o: Order, cardKey: string, chargedCents = o.amountCents) => {
    const c = CARD[cardKey]; const f: Record<string, string> = { Lite_Payment_Card_Status: String(c.status), Lite_Result_Description: c.desc, MerchantReference: o.reference, Lite_Merchant_Trace: o.trace, Lite_Order_Amount: String(chargedCents), Lite_Currency_AlphaCode: o.currency,
      Lite_Order_AuthorisationCode: c.status === 0 ? "TST123" : "", Lite_BankReference: "20261117:1", Lite_TransactionIndex: crypto.randomUUID(), Lite_TransactionDate: "2026-11-17 14:00:00", Ecom_Payment_Card_Number: `${cardKey.slice(0, 4)}........${cardKey.slice(12, 16)}` };
    gw.set(o.trace, f); return { ...f, LC_Nonce: o.nonce };
  };
  const path = (s: number) => (s === 0 ? "success" : [1, 2, 5, 9].includes(s) ? "trylater" : s === 255 ? "error" : "fail");
  return { orders, intakes, gw, deps, pay, path, setOdooDown: (v: boolean) => (odooDown = v) };
}

let n = 0; const stand = () => String(9901 + (n++ % 10));
const rows: any[] = [];
const row = (tc: string, country: string, kase: string, expected: string, got: string, pass: boolean) => rows.push({ tc, country, kase, expected, got, result: pass ? "PASS" : "FAIL" });

const cardCases: [string, string, string, string, Order["state"]][] = [
  ["S01", "Zimbabwe", "4242424242424242", "Approved non-3DS", "approved_pending_recon"],
  ["S02", "Zimbabwe", "2121212121212121-3", "Random decline: hot card (3)", "declined"],
  ["S03", "United Kingdom", "2121212121212121-4", "Random decline: denied (4)", "declined"],
  ["S04", "Zimbabwe", "2121212121212121-5", "Random: call for approval (5, try later)", "trylater"],
  ["S05", "United Kingdom", "5454545454545454", "Timeout (9, try later)", "trylater"],
  ["S06", "Australia", "4000000000000002", "Invalid card (14)", "declined"],
  ["S07", "United States", "expired", "Expired card (Invalid Expiry Date)", "declined"],
  ["S08", "Zimbabwe", "4070426536557386", "3DS2 frictionless OK, Bankserv Visa", "approved_pending_recon"],
  ["S09", "United Kingdom", "5189359787009697", "3DS2 frictionless OK, Bankserv MC", "approved_pending_recon"],
  ["S10", "United Arab Emirates", "4069421358347845", "3DS2 frictionless fail, Bankserv Visa", "declined"],
  ["S11", "South Africa", "5178872338408971", "3DS2 frictionless fail, Bankserv MC", "declined"],
  ["S12", "Zimbabwe", "4070427646039018", "3DS2 challenge passed, Bankserv Visa", "approved_pending_recon"],
  ["S13", "Canada", "5189354281295934", "3DS2 challenge passed, Bankserv MC", "approved_pending_recon"],
  ["S14", "United Kingdom", "4456530000001005", "CyberSource 3DS2 OK, Visa", "approved_pending_recon"],
  ["S15", "Malawi", "5200000000001005", "CyberSource 3DS2 OK, MC", "approved_pending_recon"],
  ["S16", "Ethiopia", "4456530000001013", "CyberSource 3DS2 fail", "declined"],
  ["S17", "Saudi Arabia", "4456530000001096", "CyberSource step-up passed", "approved_pending_recon"],
];

test("card status paths", async () => {
  for (const [tc, country, card, kase, want] of cardCases) {
    const h = harness(); const p = prof(country);
    const { order } = await initOrder(h.deps, { stand: stand(), amount: "25.00", maxAmount: "500", idempotencyKey: tc, billing: p.billing });
    const posted = h.pay(order, card);
    const r = await handleReturn(h.deps, h.path(Number(posted.Lite_Payment_Card_Status)), posted);
    const okIntake = want === "approved_pending_recon" ? h.intakes.length === 1 && h.intakes[0].state === "pending_qc" && h.intakes[0].intake_uuid === order.reference : h.intakes.length === 0;
    const pass = r.state === want && okIntake;
    row(tc, country, kase, `${want}${want === "approved_pending_recon" ? " + 1 Odoo intake pending_qc" : ", no Odoo record"}`, `${r.state} / page ${r.page} / intakes ${h.intakes.length}`, pass);
    assert.ok(pass, tc);
  }
});

test("robustness", async () => {
  // Replay of approved return
  { const h = harness(); const p = prof("Zimbabwe"); const { order } = await initOrder(h.deps, { stand: "9901", amount: "100", idempotencyKey: "r1", billing: p.billing });
    const posted = h.pay(order, "4242424242424242"); await handleReturn(h.deps, "success", posted); const r2 = await handleReturn(h.deps, "success", posted); const r3 = await handleReturn(h.deps, "success", { ...posted, Lite_Order_Amount: "1" });
    const pass = h.intakes.length === 1 && r2.note === "already settled" && r3.note === "already settled";
    row("S18", "Zimbabwe", "Replayed approved return (x2, one with tampered amount)", "no 2nd record", `intakes ${h.intakes.length}; ${r2.note}`, pass); assert.ok(pass); }
  // Forged approval, no gateway txn
  { const h = harness(); const p = prof("United Kingdom"); const { order } = await initOrder(h.deps, { stand: "9902", amount: "100", idempotencyKey: "f1", billing: p.billing });
    const r = await handleReturn(h.deps, "success", { Lite_Payment_Card_Status: "0", Lite_Merchant_Trace: order.trace, MerchantReference: order.reference, Lite_Order_Amount: "10000", LC_Nonce: order.nonce });
    const pass = r.state === "initiated" && h.intakes.length === 0; row("S19", "United Kingdom", "Forged 'approved' POST, no gateway transaction", "not recorded", `${r.state}; ${r.note}`, pass); assert.ok(pass); }
  // Forged approval over a real decline (AuthoriseInfo says 4)
  { const h = harness(); const p = prof("Zimbabwe"); const { order } = await initOrder(h.deps, { stand: "9901", amount: "100", idempotencyKey: "f2", billing: p.billing });
    const posted = h.pay(order, "2121212121212121-4"); const r = await handleReturn(h.deps, "success", { ...posted, Lite_Payment_Card_Status: "0" });
    const pass = r.state === "declined" && h.intakes.length === 0; row("S20", "Zimbabwe", "Declined card, return POST edited to status 0", "declined (AuthoriseInfo wins)", r.state, pass); assert.ok(pass); }
  // Tampered amount: customer edits form to $1, iVeri approves $1
  { const h = harness(); const p = prof("United Kingdom"); const { order } = await initOrder(h.deps, { stand: "9902", amount: "250.00", idempotencyKey: "t1", billing: p.billing });
    const posted = h.pay(order, "4242424242424242", 100); const r = await handleReturn(h.deps, "success", posted);
    const pass = r.state === "amount_mismatch" && h.intakes.length === 0; row("S21", "United Kingdom", "Tampered amount ($250 -> $1 in browser form)", "amount_mismatch, human queue, no Odoo record", `${r.state} ${r.note}`, pass); assert.ok(pass); }
  // Nonce mismatch flagged
  { const h = harness(); const p = prof("Australia"); const { order } = await initOrder(h.deps, { stand: "9903", amount: "50", idempotencyKey: "n1", billing: p.billing });
    const posted = h.pay(order, "4242424242424242"); const r = await handleReturn(h.deps, "success", { ...posted, LC_Nonce: "bad" });
    const o = h.orders[0]; const pass = r.state === "approved_pending_recon" && (o.flags ?? []).includes("nonce_mismatch"); row("S22", "Australia", "Return with wrong nonce (gateway says approved)", "recorded but flagged nonce_mismatch", `${r.state} flags=${o.flags}`, pass); assert.ok(pass); }
  // Duplicate submit
  { const h = harness(); const p = prof("Zimbabwe"); const a = await initOrder(h.deps, { stand: "9901", amount: "60", idempotencyKey: "d1", billing: p.billing }); const b = await initOrder(h.deps, { stand: "9901", amount: "60", idempotencyKey: "d1", billing: p.billing });
    const posted = h.pay(a.order, "4242424242424242"); await Promise.all([handleReturn(h.deps, "success", posted), handleReturn(h.deps, "success", posted)]);
    let reinit = ""; try { await initOrder(h.deps, { stand: "9901", amount: "60", idempotencyKey: "d1", billing: p.billing }); } catch (e) { reinit = String((e as Error).message); }
    const pass = a.order.reference === b.order.reference && b.reused && h.orders.length === 1 && h.intakes.length === 1 && /already/.test(reinit);
    row("S23", "Zimbabwe", "Duplicate submit (double-click, 2 concurrent returns, re-init after paid)", "1 order, 1 Odoo record, re-init refused", `orders ${h.orders.length}, intakes ${h.intakes.length}, reinit: ${reinit.slice(0, 40)}`, pass); assert.ok(pass); }
  // Abandoned after paying -> sweep
  { const h = harness(); const p = prof("United States"); const { order } = await initOrder(h.deps, { stand: "9904", amount: "75", idempotencyKey: "a1", billing: p.billing }); h.pay(order, "4242424242424242");
    const s = await sweep(h.deps, 0); const pass = h.orders[0].state === "approved_pending_recon" && h.intakes.length === 1; row("S24", "United States", "Browser closed after paying; sweep", "sweep records approval once", `${h.orders[0].state} ${JSON.stringify(s.settled)}`, pass); assert.ok(pass); }
  // Abandoned before paying -> abandoned
  { const h = harness(); const p = prof("United Arab Emirates"); await initOrder(h.deps, { stand: "9905", amount: "75", idempotencyKey: "a2", billing: p.billing });
    await sweep(h.deps, 0); const s1 = h.orders[0].state; await sweep(h.deps, 0, 0); const pass = s1 === "initiated" && h.orders[0].state === "abandoned" && h.intakes.length === 0;
    row("S25", "United Arab Emirates", "Browser closed before paying; sweep", "open, then abandoned after timeout", `${s1} -> ${h.orders[0].state}`, pass); assert.ok(pass); }
  // Odoo down -> retried by sweep, still once
  { const h = harness(); const p = prof("South Africa"); const { order } = await initOrder(h.deps, { stand: "9906", amount: "80", idempotencyKey: "o1", billing: p.billing }); h.setOdooDown(true);
    const r = await handleReturn(h.deps, "success", h.pay(order, "4242424242424242")); h.setOdooDown(false); await sweep(h.deps, 15); await sweep(h.deps, 15);
    const pass = r.recorded === false && h.intakes.length === 1 && !(h.orders[0].flags ?? []).includes("odoo_record_pending"); row("S26", "South Africa", "Odoo Staging down at approval; sweep retry", "1 intake after retry", `intakes ${h.intakes.length}`, pass); assert.ok(pass); }
  // Cancel on hosted page (observed live: 255 'Transaction cancelled by customer' to Error URL)
  { const h = harness(); const p = prof("Canada"); const { order } = await initOrder(h.deps, { stand: "9907", amount: "80", idempotencyKey: "c1", billing: p.billing });
    const r = await handleReturn(h.deps, "error", { Lite_Payment_Card_Status: "255", Lite_Result_Description: "Transaction cancelled by customer", Lite_Merchant_Trace: order.trace, MerchantReference: order.reference });
    const pass = r.state === "cancelled" && r.page === "cancelled"; row("S27", "Canada", "Customer presses Cancel on iVeri page", "cancelled page", r.state, pass); assert.ok(pass); }
  // Amount guards
  { const h = harness(); const p = prof("Malawi"); const errs: string[] = [];
    for (const [amt, max] of [["600", "500"], ["0.50", null], ["12.345", null], ["-5", null]] as const) { try { await initOrder(h.deps, { stand: "9908", amount: amt, maxAmount: max, idempotencyKey: `g${amt}`, billing: p.billing }); errs.push("ACCEPTED"); } catch (e) { errs.push((e as Error).message); } }
    const pass = !errs.includes("ACCEPTED") && h.orders.length === 0; row("S28", "Malawi", "Amount above balance / below $1 min / 3 decimals / negative", "all refused server-side", errs.join("; "), pass); assert.ok(pass); }
});

test("config, token, guards", async () => {
  const tok = await buildTransactionToken("Secret123", FAKE_APP, 2500, "tendai.moyo@example.com", 1794920000);
  const exp = crypto.createHash("sha256").update("Secret123" + "1794920000" + "/Lite/Authorise.aspx" + `{${FAKE_APP.toUpperCase()}}` + "2500" + "tendai.moyo@example.com").digest("hex");
  let p1 = tok === `1794920000:${exp}`; row("S29", "Zimbabwe", "SHA256 Lite_Transaction_Token matches spec", "time:sha256(secret+time+/Lite/Authorise.aspx+{APPID}+cents+email)", p1 ? "match" : "MISMATCH", p1); assert.ok(p1);
  let liveErr = ""; try { loadIveriConfig((k) => ({ IVERI_ENV: "live", IVERI_LIVE_APP_ID: FAKE_APP, IVERI_RETURN_BASE_URL: "x", IVERI_PORTAL_BASE_URL: "y" } as any)[k]); } catch (e) { liveErr = (e as Error).message; }
  let odooErr = ""; try { assertStagingOdoo({ url: "https://lakecity-standledger.odoo.com", db: "anyandoro14-standledger-main-31875970", uid: 1, apiKey: "x", receiptBaseUrl: "x" }); } catch (e) { odooErr = (e as Error).message; }
  const p2 = /locked/.test(liveErr) && /Refusing/.test(odooErr); row("S30", "Ethiopia", "Live mode lock + Production Odoo refused", "both refused", `${liveErr} | ${odooErr}`, p2); assert.ok(p2);
  const p3 = buildReference("3099", 123) === "ST3099-000123" && classifyStatus("-255") === "unknown"; row("S31", "Saudi Arabia", "Reference format ST<stand>-<seq>", "ST3099-000123", buildReference("3099", 123), p3); assert.ok(p3);
});

test.after(() => { fs.writeFileSync(new URL("./sim_results.json", import.meta.url), JSON.stringify(rows, null, 1)); });
