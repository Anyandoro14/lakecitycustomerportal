/**
 * Paynow payment status mapping.
 *
 * Sources:
 *  - https://developers.paynow.co.zw/docs/billpay/vendor/payment-status/
 *  - https://developers.paynow.co.zw/docs/billpay/vendor/payment-response/
 *
 * BillPay vendor statuses: Authorized, BeingProcessed, Paid, Failed, Reversed, Flagged.
 * Classic web-checkout statuses (Cancelled, Awaiting Delivery, Delivered, Sent,
 * Refunded, Disputed, Created, Pending) are mapped into the same journey so the
 * existing checkout and EcoCash / OneMoney flows keep working.
 */

export type PaymentJourneyState =
  | "authorized"
  | "processing"
  | "paid"
  | "failed"
  | "reversed"
  | "flagged"
  | "cancelled"
  | "unknown";

export type StatusTone = "success" | "pending" | "danger" | "neutral";

export interface PaymentStatusInfo {
  state: PaymentJourneyState;
  /** Short badge label */
  label: string;
  /** Page title on the status journey */
  title: string;
  /** Customer-friendly explanation */
  description: string;
  tone: StatusTone;
  /** true when no further change is expected and polling should stop */
  terminal: boolean;
  paid: boolean;
}

const STATE_INFO: Record<PaymentJourneyState, Omit<PaymentStatusInfo, "state">> = {
  authorized: {
    label: "Authorised",
    title: "Payment authorised",
    description:
      "Paynow has authorised this payment and is completing it. This page refreshes automatically.",
    tone: "pending",
    terminal: false,
    paid: false,
  },
  processing: {
    label: "Being processed",
    title: "Payment being processed",
    description:
      "Paynow is still processing this payment. Approvals on your phone can take a few minutes — this page checks again automatically.",
    tone: "pending",
    terminal: false,
    paid: false,
  },
  paid: {
    label: "Paid",
    title: "Payment received",
    description: "Your payment was successful and has been applied to your account.",
    tone: "success",
    terminal: true,
    paid: true,
  },
  failed: {
    label: "Failed",
    title: "Payment failed",
    description: "This payment did not go through. No money has left your account.",
    tone: "danger",
    terminal: true,
    paid: false,
  },
  reversed: {
    label: "Reversed",
    title: "Payment reversed",
    description: "This payment was reversed or refunded, so it has not been applied to your account.",
    tone: "neutral",
    terminal: true,
    paid: false,
  },
  flagged: {
    label: "Under review",
    title: "Payment under review",
    description:
      "Paynow has flagged this payment for review. It can take a little while — we will keep checking for an update.",
    tone: "pending",
    terminal: false,
    paid: false,
  },
  cancelled: {
    label: "Cancelled",
    title: "Payment cancelled",
    description: "This payment was cancelled before it completed.",
    tone: "danger",
    terminal: true,
    paid: false,
  },
  unknown: {
    label: "Pending",
    title: "Waiting for confirmation",
    description: "We are waiting for Paynow to confirm this payment. This page refreshes automatically.",
    tone: "pending",
    terminal: false,
    paid: false,
  },
};

const RAW_TO_STATE: Record<string, PaymentJourneyState> = {
  // BillPay vendor statuses
  authorized: "authorized",
  authorised: "authorized",
  beingprocessed: "processing",
  "being processed": "processing",
  paid: "paid",
  failed: "failed",
  reversed: "reversed",
  flagged: "flagged",
  // Classic web checkout / express checkout statuses
  "awaiting delivery": "paid",
  awaitingdelivery: "paid",
  delivered: "paid",
  completed: "paid",
  sent: "processing",
  created: "processing",
  pending: "processing",
  processing: "processing",
  cancelled: "cancelled",
  canceled: "cancelled",
  refunded: "reversed",
  disputed: "flagged",
};

export function normalizePaymentStatus(raw: string | null | undefined): PaymentStatusInfo {
  const key = String(raw ?? "").trim().toLowerCase();
  const state = RAW_TO_STATE[key] ?? (key ? "unknown" : "unknown");
  return { state, ...STATE_INFO[state] };
}

export const toneClasses: Record<StatusTone, string> = {
  success: "bg-primary/10 text-primary border-primary/20",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
  neutral: "bg-muted text-muted-foreground border-border",
};

/**
 * Polling schedule for non-terminal statuses.
 * Paynow recommends a first status inquiry ~120s after a pending result and
 * ~180s between subsequent inquiries. A few quick early checks are kept so the
 * common fast paths (checkout return, instant wallet approval) feel responsive.
 */
export const POLL_DELAYS_MS = [5_000, 15_000, 45_000, 120_000];
export const POLL_INTERVAL_MS = 180_000;

export function nextPollDelay(attempt: number): number {
  return POLL_DELAYS_MS[attempt] ?? POLL_INTERVAL_MS;
}
