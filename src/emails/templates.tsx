// LakeCity transactional emails (React Email). ALL COPY IS PLACEHOLDER pending QC + approval.
// Never include passwords or ID numbers in any template.

import { Text } from "@react-email/components";
import { render } from "@react-email/render";
import type { EmailProps, EmailTemplateKey } from "@shared/domain/emails.ts";
import { formatCents } from "@shared/domain/schedule.ts";
import { CtaButton, EmailLayout, Summary, h1, p, small } from "./EmailLayout";

const demo = (props: EmailProps) =>
  props.isPlaceholderPricing ? <Text style={small}>Figures shown are DEMO placeholders: stand prices are TBC.</Text> : null;

function IntakeSubmitted(props: EmailProps) {
  return (
    <EmailLayout stage="intake_submitted" preview={`We've received your application for stand ${props.standNumber}`}>
      <Text style={h1}>Thank you, {props.firstName}</Text>
      <Text style={p}>We've received your application for <strong>stand {props.standNumber}</strong> at LakeCity.</Text>
      <Text style={p}>
        We've also received your ID document(s). A member of our team is checking it by hand. Your stand is not reserved
        yet: it is reserved once your deposit is paid.
      </Text>
      <Text style={p}><strong>Next step:</strong> once your ID is approved, you'll complete your offer to purchase online.</Text>
    </EmailLayout>
  );
}

function OfferCompleted(props: EmailProps) {
  return (
    <EmailLayout stage="offer_completed" preview={`Your offer for stand ${props.standNumber}`}>
      <Text style={h1}>Your offer has been submitted</Text>
      <Text style={p}>Thank you, {props.firstName}. Here is a summary of your offer to purchase. A copy is attached as a PDF.</Text>
      <Summary
        rows={[
          ["Stand number", props.standNumber],
          ["Price (VAT incl.)", formatCents(props.priceCents)],
          ["Initial deposit", formatCents(props.depositCents)],
          ["Term", `${props.termMonths} months`],
          ["Monthly payment", formatCents(props.monthlyCents)],
        ]}
      />
      {demo(props)}
      <Text style={p}>
        Please note: a non-refundable Agreement of Sale preparation fee of USD {props.aosFeeUsd} is payable to Chigwanda
        Legal Practitioners.
      </Text>
      <Text style={small}>Attachment: offer-to-purchase.pdf</Text>
    </EmailLayout>
  );
}

function ScheduleGenerated(props: EmailProps) {
  return (
    <EmailLayout stage="schedule_generated" preview={`Your ${props.termMonths}-month payment schedule`}>
      <Text style={h1}>Your payment schedule</Text>
      <Text style={p}>Your payment schedule for stand {props.standNumber} is ready. The full schedule is attached as a PDF.</Text>
      <Summary
        rows={[
          ["First instalment due", props.firstDueDate],
          ["Monthly amount", formatCents(props.monthlyCents)],
          ["Number of instalments", String(props.instalmentCount)],
          ["Total (VAT incl.)", formatCents(props.totalCents)],
        ]}
      />
      {demo(props)}
      <Text style={p}><strong>Next step:</strong> pay your deposit securely via ZikiMall to reserve your stand.</Text>
      <Text style={small}>Attachment: payment-schedule.pdf</Text>
    </EmailLayout>
  );
}

function PaymentReceived(props: EmailProps) {
  return (
    <EmailLayout stage="payment_received" preview={`Deposit received: stand ${props.standNumber} is reserved`}>
      <Text style={h1}>We've received your payment</Text>
      <Summary
        rows={[
          ["Amount", props.paymentAmountCents === null ? "-" : formatCents(props.paymentAmountCents)],
          ["Date", props.paymentDate ?? "-"],
          ["Reference", props.paymentReference ?? "-"],
        ]}
      />
      <Text style={p}>
        <strong>Stand {props.standNumber} is now reserved for you</strong> and has been taken off the market.
      </Text>
      <Text style={p}><strong>Next step:</strong> sign your Agreement of Sale online. Your stand is allocated to you once it's signed.</Text>
    </EmailLayout>
  );
}

function AgreementSigned(props: EmailProps) {
  return (
    <EmailLayout stage="agreement_signed" preview={`Agreement signed: stand ${props.standNumber} is allocated to you`}>
      <Text style={h1}>Your agreement is signed</Text>
      <Text style={p}>
        Congratulations, {props.firstName}. Your Agreement of Sale has been signed and <strong>stand {props.standNumber} is
        now allocated to you</strong>.
      </Text>
      <Text style={p}>DocuSign will email you the completed, signed copy of your agreement separately.</Text>
    </EmailLayout>
  );
}

function PortalCreated(props: EmailProps) {
  return (
    <EmailLayout stage="portal_created" preview="Activate your LakeCity customer portal">
      <Text style={h1}>Your customer portal account is ready</Text>
      <Text style={p}>
        We've created your LakeCity customer portal account, linked to stand {props.standNumber}
        {props.collectionAccountId ? ` and collection account ${props.collectionAccountId}` : ""}.
      </Text>
      <Summary rows={[["Portal", props.portalUrl.replace(/^https?:\/\//, "")], ["Username", props.portalEmail]]} />
      <Text style={p}>
        <strong>How to activate:</strong> return to your application and either set a password or request a one-time
        sign-in link. We will never send you your password by email.
      </Text>
      <CtaButton href={props.portalUrl}>Go to the portal</CtaButton>
    </EmailLayout>
  );
}

function Celebration(props: EmailProps) {
  return (
    <EmailLayout stage="celebration" preview="Welcome to the LakeCity family">
      <Text style={h1}>Welcome to LakeCity, {props.firstName}!</Text>
      <Text style={p}>Stand {props.standNumber} is yours, and your customer portal is active.</Text>
      <Text style={p}>
        At LakeCity we do business with honesty, integrity and transparency. You'll always know where you stand: what
        you've paid, what's next, and how your account is progressing.
      </Text>
      <Text style={p}>Log in anytime to get your up-to-date statement and track the payments you've made so far.</Text>
      <CtaButton href={props.portalUrl}>Log in to your portal</CtaButton>
    </EmailLayout>
  );
}

export const EMAIL_TEMPLATES: Record<EmailTemplateKey, (props: EmailProps) => React.ReactElement> = {
  intake_submitted: IntakeSubmitted,
  offer_completed: OfferCompleted,
  schedule_generated: ScheduleGenerated,
  payment_received: PaymentReceived,
  agreement_signed: AgreementSigned,
  portal_created: PortalCreated,
  celebration: Celebration,
};

export async function renderEmailHtml(key: EmailTemplateKey, props: EmailProps): Promise<string> {
  const Template = EMAIL_TEMPLATES[key];
  return render(<Template {...props} />);
}
