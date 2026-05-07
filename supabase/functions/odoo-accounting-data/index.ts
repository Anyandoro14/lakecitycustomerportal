import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { getOdooConfig, odooSearchRead, type OdooConfig } from "../_shared/odoo-client.ts";

/**
 * odoo-accounting-data
 *
 * Read-only proxy that powers the v1 Odoo Accounting UI (`/odoo-accounting`).
 * Operations: "dashboard" | "invoices" | "payments" | "aged_receivables" | "ping"
 *
 * Target: Odoo 19 (Odoo.sh / Odoo Online). Field & selection values verified
 * against odoo/odoo @ 19.0 (account.move, account.payment).
 *
 * Auth: Supabase user JWT (Authorization: Bearer ...). Tenant resolved from
 * the caller's profile, so credentials are never accepted from the client.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Operation = "dashboard" | "invoices" | "payments" | "aged_receivables" | "ping";

interface RequestBody {
  operation: Operation;
  limit?: number;
  offset?: number;
  search?: string;
  state?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Odoo returns Many2one as [id, display_name] tuple; flatten to a friendly shape.
const m2oName = (val: unknown): string =>
  Array.isArray(val) && val.length >= 2 ? String(val[1]) : "";
const m2oId = (val: unknown): number | null =>
  Array.isArray(val) && val.length >= 1 ? Number(val[0]) : null;

const todayISO = () => new Date().toISOString().slice(0, 10);

const startOfMonthISO = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

async function handleDashboard(config: OdooConfig) {
  const today = todayISO();
  const monthStart = startOfMonthISO();

  // Open customer invoices (posted, not fully paid)
  const openInvoices = await odooSearchRead(
    "account.move",
    [
      ["move_type", "=", "out_invoice"],
      ["state", "=", "posted"],
      ["payment_state", "in", ["not_paid", "partial", "in_payment"]],
    ],
    ["id", "amount_residual", "invoice_date_due", "currency_id"],
    config,
    { limit: 1000 },
  );

  let totalReceivable = 0;
  let overdueAmount = 0;
  let overdueCount = 0;

  for (const inv of openInvoices) {
    const residual = Number(inv.amount_residual) || 0;
    totalReceivable += residual;
    if (inv.invoice_date_due && inv.invoice_date_due < today) {
      overdueAmount += residual;
      overdueCount += 1;
    }
  }

  // Customer payments this month.
  // Odoo 19 account.payment.state ∈ {draft, in_process, paid, canceled, rejected}.
  // We count "in_process" + "paid" as money received (paid = matched, in_process = sent/awaiting reconciliation).
  const monthPayments = await odooSearchRead(
    "account.payment",
    [
      ["partner_type", "=", "customer"],
      ["state", "in", ["paid", "in_process"]],
      ["date", ">=", monthStart],
    ],
    ["id", "amount"],
    config,
    { limit: 1000 },
  );
  const collectedThisMonth = monthPayments.reduce(
    (sum: number, p: any) => sum + (Number(p.amount) || 0),
    0,
  );

  // Currency: assume single currency for v1 — pull from the first invoice
  const currency = openInvoices[0] ? m2oName(openInvoices[0].currency_id) : "USD";

  return {
    open_invoice_count: openInvoices.length,
    total_receivable: round2(totalReceivable),
    overdue_amount: round2(overdueAmount),
    overdue_count: overdueCount,
    collected_this_month: round2(collectedThisMonth),
    payment_count_this_month: monthPayments.length,
    currency,
    as_of: today,
  };
}

async function handleInvoices(config: OdooConfig, body: RequestBody) {
  const limit = clamp(body.limit ?? 50, 1, 200);
  const offset = Math.max(0, body.offset ?? 0);

  const domain: any[] = [["move_type", "=", "out_invoice"]];
  if (body.state && body.state !== "all") {
    if (body.state === "open") {
      domain.push(["state", "=", "posted"]);
      domain.push(["payment_state", "in", ["not_paid", "partial", "in_payment"]]);
    } else if (body.state === "paid") {
      domain.push(["payment_state", "in", ["paid", "reversed"]]);
    } else if (body.state === "draft") {
      domain.push(["state", "=", "draft"]);
    } else if (body.state === "overdue") {
      domain.push(["state", "=", "posted"]);
      domain.push(["payment_state", "in", ["not_paid", "partial"]]);
      domain.push(["invoice_date_due", "<", todayISO()]);
    }
  }
  if (body.search) {
    domain.push("|", ["name", "ilike", body.search], ["partner_id.name", "ilike", body.search]);
  }

  const rows = await odooSearchRead(
    "account.move",
    domain,
    [
      "id",
      "name",
      "partner_id",
      "invoice_date",
      "invoice_date_due",
      "amount_total",
      "amount_residual",
      "state",
      "payment_state",
      "currency_id",
    ],
    config,
    { limit, offset, order: "invoice_date desc, id desc" },
  );

  return {
    invoices: rows.map((r: any) => ({
      id: Number(r.id),
      number: String(r.name ?? ""),
      partner_id: m2oId(r.partner_id),
      partner_name: m2oName(r.partner_id),
      invoice_date: r.invoice_date || null,
      due_date: r.invoice_date_due || null,
      amount_total: round2(Number(r.amount_total) || 0),
      amount_residual: round2(Number(r.amount_residual) || 0),
      state: String(r.state ?? ""),
      payment_state: String(r.payment_state ?? ""),
      currency: m2oName(r.currency_id),
    })),
    has_more: rows.length === limit,
  };
}

async function handlePayments(config: OdooConfig, body: RequestBody) {
  const limit = clamp(body.limit ?? 50, 1, 200);
  const offset = Math.max(0, body.offset ?? 0);

  const domain: any[] = [["partner_type", "=", "customer"]];
  if (body.search) {
    domain.push("|", ["name", "ilike", body.search], ["partner_id.name", "ilike", body.search]);
  }

  // Odoo 19: payment reference is `memo` (renamed from `ref` in v17). The underlying
  // move's `ref` still exists but `memo` is the user-facing field on account.payment.
  const rows = await odooSearchRead(
    "account.payment",
    domain,
    ["id", "name", "partner_id", "date", "amount", "state", "journal_id", "memo", "currency_id"],
    config,
    { limit, offset, order: "date desc, id desc" },
  );

  return {
    payments: rows.map((r: any) => ({
      id: Number(r.id),
      number: String(r.name ?? ""),
      partner_id: m2oId(r.partner_id),
      partner_name: m2oName(r.partner_id),
      date: r.date || null,
      amount: round2(Number(r.amount) || 0),
      state: String(r.state ?? ""),
      journal: m2oName(r.journal_id),
      reference: r.memo ? String(r.memo) : null,
      currency: m2oName(r.currency_id),
    })),
    has_more: rows.length === limit,
  };
}

async function handleAgedReceivables(config: OdooConfig) {
  const today = todayISO();
  const rows = await odooSearchRead(
    "account.move",
    [
      ["move_type", "=", "out_invoice"],
      ["state", "=", "posted"],
      ["payment_state", "in", ["not_paid", "partial", "in_payment"]],
    ],
    ["id", "name", "partner_id", "invoice_date_due", "amount_residual", "currency_id"],
    config,
    { limit: 2000, order: "invoice_date_due asc" },
  );

  const buckets = {
    not_due: { label: "Not yet due", total: 0, count: 0 },
    d_0_30: { label: "1–30 days", total: 0, count: 0 },
    d_31_60: { label: "31–60 days", total: 0, count: 0 },
    d_61_90: { label: "61–90 days", total: 0, count: 0 },
    d_90_plus: { label: "90+ days", total: 0, count: 0 },
  };

  type CustomerRow = {
    partner_id: number | null;
    partner_name: string;
    not_due: number;
    d_0_30: number;
    d_31_60: number;
    d_61_90: number;
    d_90_plus: number;
    total: number;
  };
  const customers = new Map<string, CustomerRow>();
  let currency = "USD";

  for (const inv of rows) {
    const residual = Number(inv.amount_residual) || 0;
    if (residual <= 0) continue;
    const due = inv.invoice_date_due as string | false;
    const partnerId = m2oId(inv.partner_id);
    const partnerName = m2oName(inv.partner_id) || "(unnamed)";
    if (!currency || currency === "USD") currency = m2oName(inv.currency_id) || currency;

    let bucketKey: keyof typeof buckets;
    if (!due || due >= today) {
      bucketKey = "not_due";
    } else {
      const days = daysBetween(due, today);
      if (days <= 30) bucketKey = "d_0_30";
      else if (days <= 60) bucketKey = "d_31_60";
      else if (days <= 90) bucketKey = "d_61_90";
      else bucketKey = "d_90_plus";
    }
    buckets[bucketKey].total += residual;
    buckets[bucketKey].count += 1;

    const key = String(partnerId ?? `name:${partnerName}`);
    let row = customers.get(key);
    if (!row) {
      row = {
        partner_id: partnerId,
        partner_name: partnerName,
        not_due: 0,
        d_0_30: 0,
        d_31_60: 0,
        d_61_90: 0,
        d_90_plus: 0,
        total: 0,
      };
      customers.set(key, row);
    }
    row[bucketKey] += residual;
    row.total += residual;
  }

  const customerRows = Array.from(customers.values())
    .map((c) => ({
      ...c,
      not_due: round2(c.not_due),
      d_0_30: round2(c.d_0_30),
      d_31_60: round2(c.d_31_60),
      d_61_90: round2(c.d_61_90),
      d_90_plus: round2(c.d_90_plus),
      total: round2(c.total),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    as_of: today,
    currency,
    buckets: Object.entries(buckets).map(([key, b]) => ({
      key,
      label: b.label,
      total: round2(b.total),
      count: b.count,
    })),
    customers: customerRows,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function daysBetween(fromISO: string, toISO: string) {
  const a = Date.UTC(
    Number(fromISO.slice(0, 4)),
    Number(fromISO.slice(5, 7)) - 1,
    Number(fromISO.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(toISO.slice(0, 4)),
    Number(toISO.slice(5, 7)) - 1,
    Number(toISO.slice(8, 10)),
  );
  return Math.floor((b - a) / 86400000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userToken = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(userToken);
    if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("tenant_id, role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (profileError || !profile?.tenant_id) {
      return json({ error: "No tenant associated with user" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    if (!body?.operation) return json({ error: "Missing operation" }, 400);

    const config = await getOdooConfig(profile.tenant_id).catch((e: Error) => {
      throw new Error(`Odoo not configured for this tenant: ${e.message}`);
    });

    switch (body.operation) {
      case "ping":
        return json({ ok: true, odoo_url: config.url, db: config.db });
      case "dashboard":
        return json(await handleDashboard(config));
      case "invoices":
        return json(await handleInvoices(config, body));
      case "payments":
        return json(await handlePayments(config, body));
      case "aged_receivables":
        return json(await handleAgedReceivables(config));
      default:
        return json({ error: `Unknown operation: ${body.operation}` }, 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("odoo-accounting-data error:", message);
    return json({ error: message }, 500);
  }
});
