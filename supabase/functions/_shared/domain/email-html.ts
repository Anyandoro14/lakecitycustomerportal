// LakeCity STANDARD HTML email format (collections email template v4, QC'd). Every automated email is
// rendered on this skeleton: same header, colours, fonts, table structure, footer and sign-off.
// Table-based with inline styles only (no flexbox, no JS) so it renders in Outlook/Gmail/Apple Mail.
// Never include passwords, ID numbers or full bank account numbers (last 4 digits only).

import { PRICE_VAT_NOTE } from "./campaign.ts";
import { EMAIL_CONTACT, EMAIL_SIGN_OFF, emailSubject, type EmailProps, type EmailTemplateKey } from "./emails.ts";
import type { ProgressStage } from "./progress.ts";
import { formatUsd } from "./schedule.ts";

const C = {
  green: "#0B412F",
  gold: "#DDA23C",
  mint: "#B3CCC3",
  page: "#F5F5F5",
  text: "#2B303B",
  label: "#5B6B65",
  border: "#E3E8E6",
  cream: "#FAF8F5",
};
const SANS = "Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "'Playfair Display',Georgia,'Times New Roman',serif";
const PORTAL = "https://lakecity.standledger.io";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
const e = escapeHtml;
const money = (c: number | null) => (c === null ? "-" : formatUsd(c));

const para = (html: string, margin = "0 0 18px 0") =>
  `<p style="margin:${margin};font-family:${SANS};font-size:16px;line-height:1.7;color:${C.text};">${html}</p>`;

/** Table-based progress bar: ticked (done), gold (current), outlined (pending). Four 25% columns fit 320px screens. */
export function progressBarHtml(stages: ProgressStage[]): string {
  const cells = stages
    .map((s, i) => {
      const circle =
        s.state === "done"
          ? { bg: C.green, fg: "#ffffff", border: C.green, mark: "&#10003;" }
          : s.state === "current"
            ? { bg: C.gold, fg: C.green, border: C.gold, mark: String(i + 1) }
            : { bg: "#ffffff", fg: C.label, border: C.border, mark: String(i + 1) };
      const labelColor = s.state === "pending" ? C.label : C.green;
      const weight = s.state === "current" ? 700 : 600;
      const bar = s.state === "done" ? C.green : s.state === "current" ? C.gold : C.border;
      return `<td width="25%" align="center" valign="top" data-stage="${s.key}" data-state="${s.state}" style="width:25%;padding:0 2px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="4" bgcolor="${bar}" style="height:4px;line-height:4px;font-size:0;background:${bar};">&nbsp;</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:10px auto 0 auto;"><tr><td width="28" height="28" align="center" valign="middle" bgcolor="${circle.bg}" style="width:28px;height:28px;border:2px solid ${circle.border};border-radius:16px;background:${circle.bg};font-family:${SANS};font-size:13px;font-weight:700;line-height:28px;color:${circle.fg};">${circle.mark}</td></tr></table>
<p style="margin:6px 0 0 0;font-family:${SANS};font-size:12px;line-height:1.3;font-weight:${weight};color:${labelColor};">${e(s.label)}</p>
</td>`;
    })
    .join("");
  return `<tr><td class="pad" style="padding:22px 36px 4px 36px;" data-testid="purchase-progress">
<p style="margin:0 0 10px 0;font-family:${SERIF};font-size:15px;font-weight:700;color:${C.green};">Progress of your purchase</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;"><tr>${cells}</tr></table>
</td></tr>`;
}

interface SummaryRow {
  label: string;
  value: string;
  highlight?: boolean;
}

function summaryTable(title: string, rows: SummaryRow[]): string {
  const body = rows
    .map((r, i) => {
      const last = i === rows.length - 1;
      if (r.highlight) {
        return `<tr><td class="cell" style="padding:16px 20px;background:${C.cream};border-left:4px solid ${C.gold};font-family:${SANS};font-size:13px;font-weight:700;color:${C.text};">${e(r.label)}</td><td class="cell" align="right" style="padding:16px 20px;background:${C.cream};font-family:${SANS};font-size:22px;font-weight:700;color:${C.green};">${e(r.value)}</td></tr>`;
      }
      const border = last ? "" : `border-bottom:1px solid ${C.border};`;
      return `<tr><td class="cell" style="padding:14px 20px;${border}font-family:${SANS};font-size:13px;font-weight:600;color:${C.label};">${e(r.label)}</td><td class="cell" align="right" style="padding:14px 20px;${border}font-family:${SANS};font-size:16px;font-weight:700;color:${C.green};">${e(r.value)}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.border};border-radius:16px;border-collapse:separate;overflow:hidden;margin:0 0 28px 0;background:#ffffff;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
<tr><td colspan="2" style="padding:14px 20px;background:${C.green};font-family:${SERIF};font-size:17px;font-weight:700;color:#ffffff;border-bottom:3px solid ${C.gold};">${e(title)}</td></tr>
${body}</table>`;
}

function ctaButton(label: string, href: string): string {
  const h = e(href);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 30px 0;"><tr><td align="center"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${h}" style="height:48px;v-text-anchor:middle;width:300px;" arcsize="29%" stroke="f" fillcolor="${C.green}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${e(label)}</center></v:roundrect><![endif]--><!--[if !mso]><!-- --><a href="${h}" target="_blank" style="display:inline-block;background:${C.green};color:#ffffff;font-family:${SANS};font-size:16px;font-weight:600;line-height:48px;height:48px;padding:0 32px;border-radius:14px;text-decoration:none;mso-hide:all;">${e(label)}</a><!--<![endif]--></td></tr></table>`;
}

interface StandardEmail {
  title: string;
  preheader: string;
  customerName: string;
  progress: ProgressStage[];
  intro: string[];
  summary?: { title: string; rows: SummaryRow[] };
  cta?: { label: string; href: string };
  closing: string[];
}

/** The v4 skeleton. `intro`/`closing` items are trusted HTML fragments built in this file from escaped values. */
export function standardEmailHtml(m: StandardEmail): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${e(m.title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>td,p,a{font-family:Arial,sans-serif !important;}</style><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@media only screen and (max-width:620px){.wrap{padding:12px 6px !important}.pad{padding-left:20px !important;padding-right:20px !important}.cell{padding-left:14px !important;padding-right:14px !important}.logo{width:150px !important;height:auto !important}}
</style></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${e(m.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};"><tr><td align="center" class="wrap" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid ${C.border};border-radius:16px;border-collapse:separate;overflow:hidden;">

<tr><td align="center" bgcolor="${C.green}" style="background:${C.green};padding:30px 28px 24px 28px;">
<a href="${PORTAL}" target="_blank" style="text-decoration:none;"><img class="logo" src="${PORTAL}/logo-wordmark-white.png" width="180" height="29" alt="LakeCity" style="display:block;width:180px;height:29px;border:0;outline:none;color:#ffffff;font-family:${SANS};font-size:22px;font-weight:700;"></a>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:18px auto 0 auto;"><tr><td width="60" height="3" bgcolor="${C.gold}" style="width:60px;height:3px;line-height:3px;font-size:0;background:${C.gold};border-radius:2px;">&nbsp;</td></tr></table>
<p style="margin:12px 0 0 0;font-family:${SERIF};font-size:15px;letter-spacing:0.5px;color:${C.mint};">Customer Care</p>
</td></tr>
${progressBarHtml(m.progress)}
<tr><td class="pad" style="padding:28px 36px 6px 36px;">
${para(`Dear <strong style="color:${C.green};">${e(m.customerName)}</strong>,`)}
${m.intro.map((h) => para(h)).join("")}
${m.summary ? summaryTable(m.summary.title, m.summary.rows) : ""}
${m.cta ? ctaButton(m.cta.label, m.cta.href) : ""}
${m.closing.map((h) => para(h)).join("")}
<p style="margin:6px 0 30px 0;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.text};"><strong style="font-family:${SERIF};font-size:17px;color:${C.green};">${e(EMAIL_SIGN_OFF)}</strong><br><a href="mailto:${EMAIL_CONTACT}" style="color:${C.green};text-decoration:underline;">${EMAIL_CONTACT}</a></p>
</td></tr>
<tr><td align="center" bgcolor="${C.green}" class="pad" style="background:${C.green};padding:22px 36px;border-top:3px solid ${C.gold};">
<p style="margin:0 0 6px 0;font-family:${SERIF};font-size:16px;font-weight:700;color:#ffffff;">LakeCity</p>
<p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.mint};">Customer Portal: <a href="${PORTAL}" style="color:${C.gold};text-decoration:none;">lakecity.standledger.io</a> &nbsp;·&nbsp; <a href="mailto:${EMAIL_CONTACT}" style="color:${C.gold};text-decoration:none;">${EMAIL_CONTACT}</a></p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

const b = (s: string) => `<strong style="color:${C.green};">${e(s)}</strong>`;

function offerCompleted(p: EmailProps): StandardEmail {
  return {
    title: emailSubject("offer_completed", p.standNumber),
    preheader: `Your offer for stand ${p.standNumber} has been submitted. Pay ${money(p.dueNowCents)} by card to reserve it.`,
    customerName: p.customerName,
    progress: p.progress,
    intro: [
      `Thank you for choosing LakeCity. Your offer to purchase stand ${b(p.standNumber)} has been submitted, and a copy is attached as a PDF.`,
    ],
    summary: {
      title: "Your offer",
      rows: [
        { label: "Stand number", value: p.standNumber },
        { label: "Size", value: p.sizeSqm ? `${p.sizeSqm.toLocaleString("en-US")} m²` : "-" },
        { label: "Total price", value: p.priceCents === null ? "-" : `${money(p.priceCents)} ${PRICE_VAT_NOTE}` },
        { label: "Down payment", value: money(p.downPaymentCents) },
        { label: "Legal fee", value: money(p.legalFeeCents) },
        { label: "Then monthly", value: p.monthlyCents === null ? "-" : `about ${money(p.monthlyCents)} × ${p.termMonths}` },
        { label: "Due now", value: money(p.dueNowCents), highlight: true },
      ],
    },
    cta: { label: "View your offer", href: p.offerUrl },
    closing: [
      `${b("Next step:")} pay ${e(money(p.dueNowCents))} by Visa or Mastercard on the secure CBZ iVeri payment page. Your stand ${b(p.standNumber)} is reserved as soon as the bank approves the payment.`,
      "Attachment: offer-to-purchase.pdf",
    ],
  };
}

function paymentThankYou(p: EmailProps): StandardEmail {
  return {
    title: emailSubject("payment_thank_you", p.standNumber),
    preheader: `Thank you - stand ${p.standNumber} is reserved for you.`,
    customerName: p.customerName,
    progress: p.progress,
    intro: [
      `Thank you! We've received your payment and stand ${b(p.standNumber)} is now reserved for you. Welcome to the LakeCity family.`,
    ],
    summary: {
      title: "Payment received",
      rows: [
        { label: "Stand number", value: p.standNumber },
        { label: "Date", value: p.paymentDate ?? "-" },
        { label: "Reference", value: p.paymentReference ?? "-" },
        { label: "Amount paid", value: money(p.paymentAmountCents), highlight: true },
      ],
    },
    cta: { label: "View your offer", href: p.offerUrl },
    closing: [
      `${b("Next step:")} set up your portal account with your stand number and phone number so you can follow your payments.`,
    ],
  };
}

function portalReady(p: EmailProps): StandardEmail {
  return {
    title: emailSubject("portal_ready", p.standNumber),
    preheader: "Your LakeCity account records are ready.",
    customerName: p.customerName,
    progress: p.progress,
    intro: [
      `We've set up the records for stand ${b(p.standNumber)}${p.collectionAccountId ? ` (account ${e(p.collectionAccountId)})` : ""}, including your ${p.termMonths}-month payment schedule.`,
    ],
    summary: {
      title: "Account summary",
      rows: [
        { label: "Stand number", value: p.standNumber },
        { label: "Paid so far", value: money(p.paymentAmountCents) },
        { label: "Monthly payment", value: p.monthlyCents === null ? "-" : `about ${money(p.monthlyCents)}`, highlight: true },
      ],
    },
    cta: { label: "Log in to the Customer Portal", href: p.portalUrl },
    closing: ["LakeCity will confirm when your portal login is ready. We will never send you a password by email."],
  };
}

const BUILDERS: Record<EmailTemplateKey, (p: EmailProps) => StandardEmail> = {
  offer_completed: offerCompleted,
  payment_thank_you: paymentThankYou,
  portal_ready: portalReady,
};

export function renderStandardEmail(key: EmailTemplateKey, props: EmailProps): string {
  return standardEmailHtml(BUILDERS[key](props));
}
