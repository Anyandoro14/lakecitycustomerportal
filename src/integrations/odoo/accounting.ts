import { supabase } from "@/integrations/supabase/client";

/**
 * Typed client for the Odoo Accounting v1 UI.
 * All calls go through the `odoo-accounting-data` edge function so credentials
 * stay server-side. The user's tenant is resolved from their JWT.
 */

export interface DashboardData {
  open_invoice_count: number;
  total_receivable: number;
  overdue_amount: number;
  overdue_count: number;
  collected_this_month: number;
  payment_count_this_month: number;
  currency: string;
  as_of: string;
}

export type InvoiceState = "draft" | "posted" | "cancel" | string;
export type PaymentState =
  | "not_paid"
  | "in_payment"
  | "partial"
  | "paid"
  | "reversed"
  | "invoicing_legacy"
  | string;

export interface Invoice {
  id: number;
  number: string;
  partner_id: number | null;
  partner_name: string;
  invoice_date: string | null;
  due_date: string | null;
  amount_total: number;
  amount_residual: number;
  state: InvoiceState;
  payment_state: PaymentState;
  currency: string;
}

export interface Payment {
  id: number;
  number: string;
  partner_id: number | null;
  partner_name: string;
  date: string | null;
  amount: number;
  state: string;
  journal: string;
  reference: string | null;
  currency: string;
}

export interface AgedBucket {
  key: "not_due" | "d_0_30" | "d_31_60" | "d_61_90" | "d_90_plus" | string;
  label: string;
  total: number;
  count: number;
}

export interface AgedCustomerRow {
  partner_id: number | null;
  partner_name: string;
  not_due: number;
  d_0_30: number;
  d_31_60: number;
  d_61_90: number;
  d_90_plus: number;
  total: number;
}

export interface AgedReceivables {
  as_of: string;
  currency: string;
  buckets: AgedBucket[];
  customers: AgedCustomerRow[];
}

export type InvoiceFilter = "all" | "open" | "paid" | "draft" | "overdue";

interface BaseRequest {
  operation: "dashboard" | "invoices" | "payments" | "aged_receivables" | "ping";
  limit?: number;
  offset?: number;
  search?: string;
  state?: InvoiceFilter;
}

async function call<T>(body: BaseRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke("odoo-accounting-data", { body });
  if (error) {
    // Edge function errors come back with the response body in `context`.
    const ctxMessage = (error as unknown as { context?: { error?: string } })?.context?.error;
    throw new Error(ctxMessage || error.message || "Odoo request failed");
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}

export const odooAccounting = {
  ping: () => call<{ ok: boolean; odoo_url: string; db: string }>({ operation: "ping" }),
  dashboard: () => call<DashboardData>({ operation: "dashboard" }),
  invoices: (params: { limit?: number; offset?: number; search?: string; state?: InvoiceFilter } = {}) =>
    call<{ invoices: Invoice[]; has_more: boolean }>({ operation: "invoices", ...params }),
  payments: (params: { limit?: number; offset?: number; search?: string } = {}) =>
    call<{ payments: Payment[]; has_more: boolean }>({ operation: "payments", ...params }),
  agedReceivables: () => call<AgedReceivables>({ operation: "aged_receivables" }),
};

export function formatMoney(amount: number, currency: string) {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export function paymentStateMeta(state: string): { label: string; tone: "ok" | "warn" | "info" | "muted" } {
  switch (state) {
    case "paid":
      return { label: "Paid", tone: "ok" };
    case "partial":
      return { label: "Partial", tone: "warn" };
    case "in_payment":
      return { label: "In Payment", tone: "info" };
    case "reversed":
      return { label: "Reversed", tone: "muted" };
    case "not_paid":
      return { label: "Not Paid", tone: "warn" };
    default:
      return { label: state || "—", tone: "muted" };
  }
}

export function invoiceStateMeta(state: string): { label: string; tone: "ok" | "warn" | "info" | "muted" } {
  switch (state) {
    case "posted":
      return { label: "Posted", tone: "info" };
    case "draft":
      return { label: "Draft", tone: "muted" };
    case "cancel":
      return { label: "Cancelled", tone: "muted" };
    default:
      return { label: state || "—", tone: "muted" };
  }
}
