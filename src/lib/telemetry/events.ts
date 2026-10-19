/**
 * Explicit product events for the payment funnel and statements.
 * Properties must never include PII or monetary amounts.
 *
 * North Star `payment_posted_odoo` is emitted server-side from
 * `odoo-sync-payment` (see supabase/functions/_shared/posthog.ts).
 */

import { captureEvent } from "./client";

/** Coarse instruction-section labels only — never bank account numbers. */
export type PaymentInstructionsSection =
  | "bank_transfer"
  | "remittance"
  | "pay_page"
  | "other";

export function trackPaymentFlowStarted(source?: string): void {
  captureEvent("payment_flow_started", source ? { source } : undefined);
}

/** Fired when the customer clicks through to ZikiMall (external). No amounts. */
export function trackZikimallRedirected(): void {
  captureEvent("zikimall_redirected");
}

/**
 * Fired when payment instruction UI is opened/viewed.
 * Properties: section label only — never account numbers or payee details.
 */
export function trackPaymentInstructionsViewed(
  section: PaymentInstructionsSection,
): void {
  captureEvent("payment_instructions_viewed", { section });
}

export function trackStatementViewed(): void {
  captureEvent("statement_viewed");
}
