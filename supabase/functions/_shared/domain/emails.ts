// Transactional email catalogue + send policy. Templates (React Email) live in src/emails/.
//
// DEV MODE ONLY. Emails are queued to an outbox and rendered in the internal outbox preview.
// Nothing is sent: live sending needs EMAILS_LIVE=true AND a provider AND provider credentials AND
// an approval reference, and even then the provider adapters are unimplemented stubs.
// Before go-live: Cursor QC PASS + Alex Key 1 and Key 2 approval, and an explicit owner decision on
// LakeCity's rule that customer comms are sent by staff (automated sends) - open item TBC.

import { CAMPAIGN, resolvePricing } from "./campaign.ts";
import { computeSchedule } from "./schedule.ts";
import type { Lead, Stand } from "./types.ts";

export const EMAIL_STAGES = [
  { key: "intake_submitted", label: "Application received" },
  { key: "offer_completed", label: "Offer submitted" },
  { key: "schedule_generated", label: "Payment schedule" },
  { key: "payment_received", label: "Deposit received" },
  { key: "agreement_signed", label: "Agreement signed" },
  { key: "portal_created", label: "Portal account" },
  { key: "celebration", label: "Welcome home" },
] as const;

export type EmailTemplateKey = (typeof EMAIL_STAGES)[number]["key"];

export const EMAIL_SUBJECTS: Record<EmailTemplateKey, string> = {
  intake_submitted: "[PLACEHOLDER] We've received your LakeCity application",
  offer_completed: "[PLACEHOLDER] Your offer to purchase - copy attached",
  schedule_generated: "[PLACEHOLDER] Your LakeCity payment schedule",
  payment_received: "[PLACEHOLDER] Deposit received - your stand is reserved",
  agreement_signed: "[PLACEHOLDER] Agreement signed - your stand is allocated",
  portal_created: "[PLACEHOLDER] Activate your LakeCity customer portal",
  celebration: "[PLACEHOLDER] Welcome to the LakeCity family",
};

export const EMAIL_ATTACHMENTS: Partial<Record<EmailTemplateKey, string[]>> = {
  offer_completed: ["offer-to-purchase.pdf"],
  schedule_generated: ["payment-schedule.pdf"],
};

export const EMAIL_CONTACT = "admin@lakecity.co.zw";
export const EMAIL_SIGN_OFF = "LakeCity Accounts";

/** Props shared by every template. Never include passwords or ID numbers. */
export interface EmailProps {
  firstName: string;
  standNumber: string;
  portalUrl: string;
  isPlaceholderPricing: boolean;
  priceCents: number;
  depositCents: number;
  termMonths: number;
  monthlyCents: number;
  firstDueDate: string;
  instalmentCount: number;
  totalCents: number;
  aosFeeUsd: number;
  paymentAmountCents: number | null;
  paymentDate: string | null;
  paymentReference: string | null;
  portalEmail: string;
  collectionAccountId: string | null;
}

export function buildEmailProps(lead: Lead, stand: Stand, portalUrl: string): EmailProps {
  const pricing = resolvePricing(stand);
  const offerDate = (lead.offer?.submittedAt ?? lead.createdAt).slice(0, 10);
  const schedule = computeSchedule({
    priceUsd: pricing.priceUsd,
    depositUsd: pricing.depositUsd,
    termMonths: lead.offer?.termMonths ?? CAMPAIGN.termMonths,
    depositInstalments: lead.offer?.depositInstalments ?? 1,
    dueDay: CAMPAIGN.dueDay,
    startDate: offerDate,
  });
  const firstInstalment = schedule.rows.find((r) => r.kind === "instalment");
  return {
    firstName: lead.buyer.fullName.split(" ")[0] ?? lead.buyer.fullName,
    standNumber: lead.standNumber,
    portalUrl,
    isPlaceholderPricing: pricing.isPlaceholder,
    priceCents: schedule.totalCents,
    depositCents: schedule.depositCents,
    termMonths: schedule.termMonths,
    monthlyCents: schedule.monthlyInstalmentCents,
    firstDueDate: firstInstalment?.dueDate ?? "",
    instalmentCount: schedule.termMonths,
    totalCents: schedule.totalCents,
    aosFeeUsd: CAMPAIGN.aosFeeUsd,
    paymentAmountCents: lead.paidAt ? schedule.rows[0].amountCents : null,
    paymentDate: lead.paidAt?.slice(0, 10) ?? null,
    paymentReference: lead.paymentReference,
    portalEmail: lead.buyer.email,
    collectionAccountId: lead.collectionAccountId,
  };
}

export type EmailProviderName = "none" | "resend" | "google_workspace";

export interface EmailEnv {
  EMAILS_LIVE?: string;
  EMAIL_PROVIDER?: string;
  EMAIL_PROVIDER_API_KEY?: string;
  EMAIL_LIVE_APPROVAL_REF?: string;
}

/** Hard gate. Returns false unless every piece of live config is present. */
export function emailsLive(env: EmailEnv): boolean {
  return (
    env.EMAILS_LIVE === "true" &&
    (env.EMAIL_PROVIDER === "resend" || env.EMAIL_PROVIDER === "google_workspace") &&
    !!env.EMAIL_PROVIDER_API_KEY &&
    !!env.EMAIL_LIVE_APPROVAL_REF
  );
}
