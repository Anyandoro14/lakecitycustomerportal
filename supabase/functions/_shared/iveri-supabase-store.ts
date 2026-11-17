// Supabase-backed Store for the iVeri core. transition() is an atomic
// UPDATE ... WHERE state = expected, so concurrent returns settle once.
import type { Order, Store } from "./iveri.ts";
// deno-lint-ignore no-explicit-any
type Supabase = any;

const toRow = (o: Partial<Order>) => {
  const r: Record<string, unknown> = {};
  if (o.reference !== undefined) r.reference = o.reference;
  if (o.trace !== undefined) r.trace = o.trace;
  if (o.nonce !== undefined) r.nonce = o.nonce;
  if (o.stand !== undefined) r.stand_number = o.stand;
  if (o.amountCents !== undefined) r.amount_cents = o.amountCents;
  if (o.currency !== undefined) r.currency = o.currency;
  if (o.env !== undefined) r.env = o.env;
  if (o.state !== undefined) r.state = o.state;
  if (o.idempotencyKey !== undefined) r.idempotency_key = o.idempotencyKey;
  if (o.billing !== undefined) r.billing = o.billing;
  if (o.result !== undefined) r.result = o.result;
  if (o.odooPaymentId !== undefined) r.odoo_intake_id = o.odooPaymentId === null ? null : String(o.odooPaymentId);
  if (o.flags !== undefined) r.flags = o.flags;
  if (o.createdAt !== undefined) r.created_at = o.createdAt;
  if (o.updatedAt !== undefined) r.updated_at = o.updatedAt;
  return r;
};
// deno-lint-ignore no-explicit-any
const fromRow = (r: any): Order => ({
  reference: r.reference, trace: r.trace, nonce: r.nonce, stand: r.stand_number, amountCents: r.amount_cents,
  currency: r.currency, env: r.env, state: r.state, idempotencyKey: r.idempotency_key, billing: r.billing ?? {},
  result: r.result ?? {}, odooPaymentId: r.odoo_intake_id, flags: r.flags ?? [], createdAt: r.created_at, updatedAt: r.updated_at,
});

export function supabaseIveriStore(sb: Supabase, extra: { userId?: string | null; tenantId?: string | null } = {}): Store {
  const T = "iveri_card_orders";
  const one = async (col: string, v: string) => {
    const { data, error } = await sb.from(T).select("*").eq(col, v).maybeSingle();
    if (error) throw new Error(`iveri store: ${error.message}`);
    return data ? fromRow(data) : null;
  };
  return {
    async nextSeq(stand) { const { data, error } = await sb.rpc("iveri_next_seq", { p_stand: stand }); if (error) throw new Error(error.message); return Number(data); },
    findByIdempotencyKey: (k) => one("idempotency_key", k),
    async insert(o) { const { error } = await sb.from(T).insert({ ...toRow(o), user_id: extra.userId ?? null, tenant_id: extra.tenantId ?? null }); if (error) throw new Error(`iveri insert: ${error.message}`); },
    getByReference: (r) => one("reference", r),
    getByTrace: (t) => one("trace", t),
    async transition(ref, expected, patch) {
      const { data, error } = await sb.from(T).update(toRow(patch)).eq("reference", ref).eq("state", expected).select("*");
      if (error) throw new Error(`iveri transition: ${error.message}`);
      return data?.length ? fromRow(data[0]) : null;
    },
    async update(ref, patch) { const { error } = await sb.from(T).update(toRow(patch)).eq("reference", ref); if (error) throw new Error(error.message); },
    async listInitiatedOlderThan(c) { const { data, error } = await sb.from(T).select("*").eq("state", "initiated").lte("created_at", c).limit(200); if (error) throw new Error(error.message); return (data ?? []).map(fromRow); },
    async listNeedingOdoo() { const { data, error } = await sb.from(T).select("*").eq("state", "approved_pending_recon").contains("flags", ["odoo_record_pending"]).limit(200); if (error) throw new Error(error.message); return (data ?? []).map(fromRow); },
  };
}
