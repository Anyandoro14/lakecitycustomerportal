// Transactional email catalogue + send policy. Templates (React Email) live in src/emails/.
//
// PREVIEW / MOCK MODE ONLY. Emails are queued to an outbox and rendered in the internal outbox
// preview. Nothing is sent: LakeCity staff send customer comms. Live sending would need
// EMAILS_LIVE=true AND a provider AND credentials AND an approval reference, and even then the
// provider adapters are unimplemented stubs. Before go-live: Cursor QC PASS + Alex Key 1 and Key 2
// approval, and an explicit owner decision on automated sends (OI-TBC-18).

import { quoteForSize } from "./campaign.ts";
import type { Lead, Stand } from "./types.ts";

/** Progress tracker shown in every email (mirrors the wizard). */
export const EMAIL_STAGES = [
  { key: "stand_chosen", label: "Stand chosen" },
  { key: "offer_completed", label: "Offer signed" },
  { key: "payment_thank_you", label: "Payment received" },
  { key: "portal_ready", label: "Portal account" },
] as const;

export type EmailStageKey = (typeof EMAIL_STAGES)[number]["key"];
export type EmailTemplateKey = Exclude<EmailStageKey, "stand_chosen">;
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

export const EMAIL_CONTACT = "admin@lakecity.co.zw";
export const EMAIL_SIGN_OFF = "LakeCity Accounts";

/** Props shared by every template. Never include passwords or ID numbers. */
export interface EmailProps {
  firstName: string;
  standNumber: string;
  sizeSqm: number | null;
  isMockSize: boolean;
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

export function buildEmailProps(lead: Lead, stand: Stand, urls: { appUrl: string; portalUrl: string }, mockSizes = true): EmailProps {
  const q = stand.sizeSqm ? quoteForSize(stand.sizeSqm) : null;
  const fallback = quoteForSize(1);
  const name = lead.offer?.buyer.fullName ?? lead.contact.fullName;
  return {
    firstName: name.split(" ")[0] || name,
    standNumber: lead.standNumber,
    sizeSqm: stand.sizeSqm,
    isMockSize: mockSizes,
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
