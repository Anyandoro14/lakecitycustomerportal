/**
 * Explicit product events for the payment funnel and statements.
 * Properties must never include PII or monetary amounts.
 */

import { captureEvent } from "./client";

export type PaymentMethodType =
  | "paynow"
  | "ecocash"
  | "onemoney"
  | "innbucks"
  | "zikimall"
  | "bank_transfer"
  | "remittance"
  | "other";

/** Coarse failure buckets only — no gateway messages that may contain PII. */
export type PaymentErrorCategory =
  | "init_failed"
  | "cancelled"
  | "declined"
  | "timeout"
  | "network"
  | "flagged"
  | "reversed"
  | "unknown";

export function trackPaymentFlowStarted(source?: string): void {
  captureEvent("payment_flow_started", source ? { source } : undefined);
}

export function trackPaymentMethodSelected(method: PaymentMethodType): void {
  captureEvent("payment_method_selected", { method });
}

export function trackPaynowRedirected(method?: PaymentMethodType): void {
  captureEvent("paynow_redirected", method ? { method } : undefined);
}

/** North Star: fire only from a confirmed-success path (server-confirmed paid). */
export function trackPaynowPaymentCompleted(): void {
  captureEvent("paynow_payment_completed");
}

export function trackPaynowPaymentFailed(errorCategory: PaymentErrorCategory): void {
  captureEvent("paynow_payment_failed", { error_category: errorCategory });
}

export function trackStatementViewed(): void {
  captureEvent("statement_viewed");
}

export function categorizePaynowFailure(
  status: string | undefined | null,
  hadError?: boolean,
): PaymentErrorCategory {
  const s = (status || "").toLowerCase();
  if (hadError && !s) return "network";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("flag")) return "flagged";
  if (s.includes("revers")) return "reversed";
  if (s.includes("fail") || s.includes("declin")) return "declined";
  if (s.includes("timeout") || s.includes("expired")) return "timeout";
  return "unknown";
}
