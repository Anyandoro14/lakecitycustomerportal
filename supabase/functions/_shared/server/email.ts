// Email provider abstraction. Automated sends are approved (OI-TBC-18 closed) and triggered by each stage,
// but every email is written to public.email_outbox (preview transport) until a provider is configured
// (OI-TBC-20). No adapter sends anything yet.

import { EMAIL_ATTACHMENTS, buildEmailProps, emailSubject, emailsLive, type EmailTemplateKey } from "../domain/emails.ts";
import type { Lead, Stand } from "../domain/types.ts";
import { adminClient, env } from "./http.ts";

interface EmailProvider {
  name: string;
  send(msg: { to: string; subject: string; html: string; attachments: { filename: string; content: Uint8Array }[] }): Promise<void>;
}

// Stubs: intentionally unimplemented until the provider is chosen (OI-TBC-20).
const resendAdapter: EmailProvider = {
  name: "resend",
  send() {
    throw new Error("Resend adapter not implemented (email provider not chosen yet, OI-TBC-20).");
  },
};
const googleWorkspaceAdapter: EmailProvider = {
  name: "google_workspace",
  send() {
    throw new Error("Google Workspace adapter not implemented (email provider not chosen yet, OI-TBC-20).");
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

  if (emailsLive(Object.fromEntries(["EMAILS_LIVE", "EMAIL_PROVIDER", "EMAIL_PROVIDER_API_KEY"].map((k) => [k, env(k)])))) {
    // Even with full config, adapters throw: rendering + sending is deliberately not wired up yet.
    console.warn("[email] EMAILS_LIVE config present but live sending is not implemented in this scaffold.");
  }
}
