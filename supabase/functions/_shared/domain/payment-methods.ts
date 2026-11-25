// ZikiMall payment flow from the official LakeCity Payment Methods document (Alex, 2026-11-25).
// Our app only links to zikimall.com: no API, no money handled here. A successful payment is confirmed
// automatically through the payment-confirmed handler (payment-events.ts); the confirmation source is a
// MOCK until OI-TBC-30 is resolved.
// Never put a full bank account number in code or copy: last 4 digits only.

import type { Lead } from "./types.ts";

export const ZIKIMALL = {
  url: "https://zikimall.com",
  poweredBy: "CBZ",
  biller: "Warwickshire",
  payee: "Warwickshire Pvt Ltd",
  /** Settlement account, masked. */
  settlementAccountMasked: "CBZ ...0018",
  methods: ["Visa", "Mastercard", "Ecocash", "Zimswitch"],
} as const;

/**
 * Customer steps from the Payment Methods document. Step 5 names the stand number, which is the
 * ZikiMall account number for every buyer (Alex, 2026-11-25).
 */
export function zikimallSteps(standNumber: string): string[] {
  return [
    "Go to zikimall.com.",
    'Click "All Payments".',
    'Select "All Billers".',
    'Search for "Warwickshire".',
    `Enter your account number (your stand number: ${standNumber}), Initial and Surname.`,
    "Select your preferred method of payment (Visa / Mastercard / Ecocash / Zimswitch).",
    "Submit and follow the prompts.",
  ];
}

export const PROOF_OF_PAYMENT_NOTE = "Keep your proof of payment (screenshot or receipt).";

/** The ZikiMall account number is the selected stand number. Shown read-only; never typed by the customer. */
export function zikimallAccountNumber(lead: Pick<Lead, "standNumber">): string {
  return lead.standNumber;
}
