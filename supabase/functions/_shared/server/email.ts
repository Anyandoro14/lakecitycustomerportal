// Email provider abstraction. DEV MODE ONLY: every email is written to public.email_outbox and
// rendered in the internal outbox preview. No adapter sends anything; LakeCity staff send customer comms.

import { EMAIL_ATTACHMENTS, buildEmailProps, emailSubject, emailsLive, type EmailTemplateKey } from "../domain/emails.ts";
import type { Lead, Stand } from "../domain/types.ts";
import { adminClient, env } from "./http.ts";

interface EmailProvider {
  name: string;
  send(msg: { to: string; subject: string; html: string; attachments: { filename: string; content: Uint8Array }[] }): Promise<void>;
}

// Stubs: intentionally unimplemented. Implement only after QC PASS + Alex Key 1/Key 2 approval and an
// owner decision on automated customer comms (LakeCity rule: customer comms are sent by staff).
const resendAdapter: EmailProvider = {
  name: "resend",
  send() {
    throw new Error("Resend adapter not implemented (live email sending is not approved).");
  },
};
const googleWorkspaceAdapter: EmailProvider = {
  name: "google_workspace",
  send() {
    throw new Error("Google Workspace adapter not implemented (live email sending is not approved).");
  },
};
export const PROVIDERS = { resend: resendAdapter, google_workspace: googleWorkspaceAdapter };

export async function queueEmail(template: EmailTemplateKey, lead: Lead, stand: Stand) {
  const portalUrl = env("PORTAL_URL") || "https://lakecity.standledger.io";
  // Server-configured only, so a client can never inject the link (OI-TBC-19).
  const appUrl = env("APP_URL") || "http://127.0.0.1:8137";
  const props = buildEmailProps(lead, stand, { appUrl, portalUrl });
  const { error } = await adminClient().from("email_outbox").insert({
    lead_id: lead.id,
    template,
    to_email: lead.contact.email,
    subject: emailSubject(template, lead.standNumber),
    props,
    attachment_names: EMAIL_ATTACHMENTS[template] ?? [],
    status: "queued_dev_only",
  });
  // Metadata only: never log addresses, ID numbers or bodies.
  console.info(`[email] queued ${template} for lead ${lead.id.slice(0, 8)} (dev outbox, not sent)${error ? " - insert failed" : ""}`);

  if (emailsLive(Object.fromEntries(["EMAILS_LIVE", "EMAIL_PROVIDER", "EMAIL_PROVIDER_API_KEY", "EMAIL_LIVE_APPROVAL_REF"].map((k) => [k, env(k)])))) {
    // Even with full config, adapters throw: rendering + sending is deliberately not wired up yet.
    console.warn("[email] EMAILS_LIVE config present but live sending is not implemented in this scaffold.");
  }
}
