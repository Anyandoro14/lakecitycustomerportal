// Stand-sales emails. Rendered for the outbox and for tests.
// The edge functions queue HTML and do not call Resend. A test can pass a mock transport.

import { DUE_AT_START_USD, VAT_NOTE, formatUsd } from "./stand-pricing.ts";

export type EmailTemplate = "offer_completed" | "payment_thank_you" | "portal_ready";

export interface StandEmail {
  template: EmailTemplate;
  to: string;
  subject: string;
  html: string;
}

const GREEN = "#0B412F";
const GOLD = "#C4A35A";

function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f4ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" class="wrap" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;">
<tr><td class="pad" style="background:${GREEN};padding:28px 32px;">
<p class="logo" style="margin:0;font-family:Georgia,'Playfair Display',serif;font-size:28px;color:#ffffff;">LakeCity</p>
<p style="margin:8px 0 0;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.08em;color:${GOLD};">CUSTOMER CARE</p>
</td></tr>
<tr><td style="height:3px;background:${GOLD};font-size:0;">&nbsp;</td></tr>
<tr><td class="pad" style="padding:28px 32px;font-family:Arial,sans-serif;color:#1c1c1c;font-size:15px;line-height:1.5;">
<p style="margin:0 0 16px;font-size:12px;color:#5c6b64;">Progress of your purchase: Signed up · Paid · Portal</p>
<h1 style="font-family:Georgia,serif;font-size:24px;color:${GREEN};margin:0 0 16px;">${title}</h1>
${body}
<p style="margin:28px 0 0;">LakeCity Accounts<br>accounts@lakecity.co.zw</p>
</td></tr>
<tr><td style="height:3px;background:${GOLD};font-size:0;">&nbsp;</td></tr>
<tr><td class="pad" style="background:${GREEN};padding:16px 32px;font-family:Arial,sans-serif;font-size:12px;color:#ffffff;">
LakeCity stand purchase. This message was queued for preview and is not sent to customers from this build.
</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderStandSalesEmail(input: {
  template: EmailTemplate;
  to: string;
  standNumber: string;
  fullName: string;
  amountCents?: number;
  reference?: string;
}): StandEmail {
  const stand = input.standNumber;
  const due = formatUsd(DUE_AT_START_USD * 100);
  if (input.template === "offer_completed") {
    return {
      template: input.template,
      to: input.to,
      subject: `Your LakeCity offer for stand ${stand}`,
      html: shell(
        "Offer received",
        `<p>Hello ${escapeHtml(input.fullName)}, we have your offer for stand ${escapeHtml(stand)}. The stand price is ${VAT_NOTE}. ${due} is due now (down payment and legal fee) by card.</p>`,
      ),
    };
  }
  if (input.template === "payment_thank_you") {
    return {
      template: input.template,
      to: input.to,
      subject: `Payment received for stand ${stand}`,
      html: shell(
        "Thank you for your payment",
        `<p>Hello ${escapeHtml(input.fullName)}, stand ${escapeHtml(stand)} is reserved for you.</p>
<table role="presentation" cellpadding="8" cellspacing="0" style="border:1px solid ${GOLD};border-collapse:collapse;">
<tr style="background:${GREEN};color:#fff;"><th align="left">Item</th><th align="left">Detail</th></tr>
<tr><td>Amount</td><td>${escapeHtml(formatUsd(input.amountCents ?? DUE_AT_START_USD * 100))}</td></tr>
<tr><td>Reference</td><td>${escapeHtml(input.reference ?? "")}</td></tr>
</table>
<p>Your card payment was confirmed by the bank. LakeCity Accounts will not ask you to pay this amount again.</p>`,
      ),
    };
  }
  return {
    template: input.template,
    to: input.to,
    subject: `Your LakeCity portal for stand ${stand}`,
    html: shell(
      "Your portal login is ready",
      `<p>Hello ${escapeHtml(input.fullName)}, you can sign in with stand number ${escapeHtml(stand)}, your password, and the verification code we send when you sign in. This email never includes a password.</p>`,
    ),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface EmailTransport {
  send(email: StandEmail): Promise<void>;
}

/** Used by tests. Production edge functions do not call this. */
export function buildResendRequest(apiKey: string, email: StandEmail) {
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  return {
    url: "https://api.resend.com/emails",
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "LakeCity Accounts <accounts@lakecity.co.zw>",
        to: [email.to],
        subject: email.subject,
        html: email.html,
      }),
    },
  };
}

export async function sendWithTransport(email: StandEmail, transport: EmailTransport): Promise<void> {
  await transport.send(email);
}
