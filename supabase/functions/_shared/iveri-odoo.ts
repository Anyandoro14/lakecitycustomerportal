// Records a VERIFIED iVeri approval in Odoo as a lakecity.receipt.intake in state
// pending_qc ("pending reconciliation"). Intakes do not touch balances; staff use
// the existing QC button (Post to BNPL) only after matching the CBZ settlement.
// This code never posts, allocates, refunds or reconciles.
import type { Order, Recorder } from "./iveri.ts";

export interface OdooTarget { url: string; db: string; uid: number; apiKey: string; receiptBaseUrl: string; allowNonStaging?: boolean }

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; json(): Promise<any> }>;

export function assertStagingOdoo(t: OdooTarget): void {
  const host = new URL(t.url).hostname;
  const isStaging = /staging/i.test(host) || /staging/i.test(t.db) || host === "127.0.0.1" || host === "localhost";
  if (!isStaging && !t.allowNonStaging) throw new Error("Refusing non-Staging Odoo target for iVeri pending payments");
}

export function odooPendingRecorder(t: OdooTarget, fetchImpl: Fetch): Recorder {
  assertStagingOdoo(t);
  let id = 0;
  const call = async (model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) => {
    const res = await fetchImpl(`${t.url.replace(/\/$/, "")}/jsonrpc`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: ++id, params: { service: "object", method: "execute_kw", args: [t.db, t.uid, t.apiKey, model, method, args, kwargs] } }),
    });
    const j = await res.json();
    if (j.error) throw new Error(`Odoo ${model}.${method}: ${j.error?.data?.message ?? j.error.message}`);
    return j.result;
  };
  return {
    async recordPending(o: Order) {
      // Idempotency: intake_uuid = our reference, one intake per reference.
      const existing = await call("lakecity.receipt.intake", "search_read", [[["intake_uuid", "=", o.reference]]], { fields: ["id", "state"], limit: 1 });
      if (existing?.length) return { id: existing[0].id };
      const contracts = await call("lakecity.loan.contract", "search_read", [[["stand_number", "=", o.stand]]], { fields: ["id", "partner_id"], limit: 2 });
      if (!contracts?.length) throw new Error(`No Odoo loan contract for stand ${o.stand}`);
      if (contracts.length > 1) throw new Error(`Multiple Odoo loan contracts for stand ${o.stand}: human check`);
      const r = o.result ?? {};
      const b = o.billing;
      const newId = await call("lakecity.receipt.intake", "create", [{
        intake_uuid: o.reference,
        timestamp_received: new Date().toISOString().replace("T", " ").slice(0, 19),
        stand_number: o.stand,
        customer_name: [b.firstName, b.lastName].filter(Boolean).join(" ") || null,
        payment_date: (r.Lite_TransactionDate || new Date().toISOString()).slice(0, 10),
        payment_amount: o.amountCents / 100,
        payment_method_raw: `Card (iVeri Lite ${o.env.toUpperCase()})`,
        deposited_to: "CBZ",
        reference: `${o.reference} | auth ${r.Lite_Order_AuthorisationCode ?? "-"} | bankref ${r.Lite_BankReference ?? "-"} | idx ${r.Lite_TransactionIndex ?? "-"} | card ${r.Ecom_Payment_Card_Number ?? "-"}`.slice(0, 250),
        receipt_url: `${t.receiptBaseUrl.replace(/\/$/, "")}?ref=${encodeURIComponent(o.reference)}`,
        entered_by: "iVeri Lite (portal) - pending reconciliation",
      }]);
      return { id: newId }; // stays pending_qc: staff post to BNPL only after CBZ settlement match
    },
  };
}
