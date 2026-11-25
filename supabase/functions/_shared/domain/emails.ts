// Transactional email catalogue + send policy. HTML is rendered on the LakeCity standard template v4
// (email-html.ts).
//
// Automated customer emails are allowed (Alex, 2026-11-25, OI-TBC-18 closed) and are triggered
// automatically. Transport is still the PREVIEW OUTBOX: nothing leaves the system until an email
// provider is chosen and configured (OI-TBC-20). The provider adapters are unimplemented stubs.

import { quoteForSize } from "./campaign.ts";
import { progressFor, type ProgressStage } from "./progress.ts";
import type { Lead, Stand } from "./types.ts";

export type EmailTemplateKey = "offer_completed" | "payment_thank_you" | "portal_ready";
export const EMAIL_TEMPLATE_KEYS: EmailTemplateKey[] = ["offer_completed", "payment_thank_you", "portal_ready"];

export const EMAIL_SUBJECTS: Record<EmailTemplateKey, string> = {
  offer_completed: "[PLACEHOLDER] Your LakeCity offer to purchase - copy attached",
  payment_thank_you: "[PLACEHOLDER] Thank you - stand {stand} is reserved for you",
  portal_ready: "[PLACEHOLDER] Your LakeCity account records are ready",
};

export function emailSubject(template: EmailTemplateKey, standNumber: string): string {
  return EMAIL_SUBJECTS[template].replace("{stand}", standNumber);
}

export const EMAIL_ATTACHMENTS: Partial<Record<EmailTemplateKey, string[]>> = {
  offer_completed: ["offer-to-purchase.pdf"],
};

export const EMAIL_CONTACT = "accounts@lakecity.co.zw";
export const EMAIL_SIGN_OFF = "LakeCity Accounts";

/** Props shared by every template. Never include passwords or ID numbers. */
export interface EmailProps {
  firstName: string;
  customerName: string;
  /** Snapshot of "Progress of your purchase" when the email was queued. */
  progress: ProgressStage[];
  standNumber: string;
  sizeSqm: number | null;
  priceCents: number | null;
  downPaymentCents: number;
  legalFeeCents: number;
  dueNowCents: number;
  monthlyCents: number | null;
  termMonths: number;
  /** Link back to the customer's submitted offer. */
  offerUrl: string;
  portalUrl: string;
  paymentAmountCents: number | null;
  paymentDate: string | null;
  paymentReference: string | null;
  collectionAccountId: string | null;
}

export function offerUrlFor(appUrl: string, leadId: string): string {
  return `${appUrl.replace(/\/$/, "")}/apply/${leadId}/offer`;
}

export function buildEmailProps(lead: Lead, stand: Stand, urls: { appUrl: string; portalUrl: string }): EmailProps {
  const q = stand.sizeSqm ? quoteForSize(stand.sizeSqm) : null;
  const fallback = quoteForSize(1);
  const name = lead.offer?.buyer.fullName ?? lead.contact.fullName;
  return {
    firstName: name.split(" ")[0] || name,
    customerName: name,
    progress: progressFor(lead),
    standNumber: lead.standNumber,
    sizeSqm: stand.sizeSqm,
    priceCents: q?.priceCents ?? null,
    downPaymentCents: fallback.downPaymentCents,
    legalFeeCents: fallback.legalFeeCents,
    dueNowCents: fallback.dueNowCents,
    monthlyCents: q?.monthlyCents ?? null,
    termMonths: fallback.termMonths,
    offerUrl: offerUrlFor(urls.appUrl, lead.id),
    portalUrl: urls.portalUrl,
    paymentAmountCents: lead.paymentAmountCents,
    paymentDate: lead.paidAt?.slice(0, 10) ?? null,
    paymentReference: lead.paymentReference,
    collectionAccountId: lead.portalRecords?.collectionSchedule.accountId ?? null,
  };
}

export type EmailProviderName = "none" | "resend" | "google_workspace";

export interface EmailEnv {
  EMAILS_LIVE?: string;
  EMAIL_PROVIDER?: string;
  EMAIL_PROVIDER_API_KEY?: string;
}

/** Hard gate: false unless a provider is fully configured (OI-TBC-20). Adapters are still stubs. */
export function emailsLive(env: EmailEnv): boolean {
  return (
    env.EMAILS_LIVE === "true" &&
    (env.EMAIL_PROVIDER === "resend" || env.EMAIL_PROVIDER === "google_workspace") &&
    !!env.EMAIL_PROVIDER_API_KEY
  );
}
