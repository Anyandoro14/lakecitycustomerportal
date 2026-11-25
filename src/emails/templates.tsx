// LakeCity transactional emails (React Email). ALL COPY IS PLACEHOLDER pending QC + approval.
// Preview/mock mode only: staff send customer comms. Never include passwords or ID numbers in any template.

import { Text } from "@react-email/components";
import { render } from "@react-email/render";
import type { EmailProps, EmailTemplateKey } from "@shared/domain/emails.ts";
import { formatUsd } from "@shared/domain/schedule.ts";
import { CtaButton, EmailLayout, Summary, h1, p, small } from "./EmailLayout";

const mockNote = (props: EmailProps) =>
  props.isMockSize ? <Text style={small}>Stand size and price shown are based on MOCK stand sizes pending confirmation.</Text> : null;

const money = (c: number | null) => (c === null ? "-" : formatUsd(c));

function OfferCompleted(props: EmailProps) {
  return (
    <EmailLayout stage="offer_completed" preview={`Your offer for stand ${props.standNumber}`}>
      <Text style={h1}>Your offer has been submitted</Text>
      <Text style={p}>Thank you, {props.firstName}. Here is a summary of your offer to purchase. A copy is attached as a PDF.</Text>
      <Summary
        rows={[
          ["Stand number", props.standNumber],
          ["Size", props.sizeSqm ? `${props.sizeSqm} m²` : "-"],
          ["Total price", money(props.priceCents)],
          ["Down payment", money(props.downPaymentCents)],
          ["Legal fee", money(props.legalFeeCents)],
          ["Due now", money(props.dueNowCents)],
          ["Then monthly", `about ${money(props.monthlyCents)} × ${props.termMonths}`],
        ]}
      />
      {mockNote(props)}
      <Text style={p}><strong>Next step:</strong> pay {money(props.dueNowCents)} securely via ZikiMall to reserve your stand.</Text>
      <Text style={small}>Attachment: offer-to-purchase.pdf</Text>
    </EmailLayout>
  );
}

function PaymentThankYou(props: EmailProps) {
  return (
    <EmailLayout stage="payment_thank_you" preview={`Thank you - stand ${props.standNumber} is reserved for you`}>
      <Text style={h1}>Thank you, {props.firstName}!</Text>
      <Text style={p}>
        We've received your payment and <strong>stand {props.standNumber} is now reserved for you</strong>. Welcome to the
        LakeCity family.
      </Text>
      <Summary
        rows={[
          ["Stand", props.standNumber],
          ["Amount paid", money(props.paymentAmountCents)],
          ["Date", props.paymentDate ?? "-"],
          ["Reference", props.paymentReference ?? "-"],
        ]}
      />
      <Text style={p}>You can view your offer to purchase at any time:</Text>
      <CtaButton href={props.offerUrl}>View your offer</CtaButton>
      <Text style={p}>
        <strong>Next step:</strong> set up your portal account with your stand number and phone number so you can follow
        your payments.
      </Text>
    </EmailLayout>
  );
}

function PortalReady(props: EmailProps) {
  return (
    <EmailLayout stage="portal_ready" preview="Your LakeCity account records are ready">
      <Text style={h1}>Your account records are ready</Text>
      <Text style={p}>
        We've set up the records for stand {props.standNumber}
        {props.collectionAccountId ? ` (account ${props.collectionAccountId})` : ""}, including your {props.termMonths}-month
        payment schedule.
      </Text>
      <Summary
        rows={[
          ["Paid so far", money(props.paymentAmountCents)],
          ["Monthly payment", money(props.monthlyCents)],
          ["Portal", props.portalUrl.replace(/^https?:\/\//, "")],
        ]}
      />
      <Text style={p}>LakeCity will confirm when your portal login is ready. We will never send you a password by email.</Text>
      <CtaButton href={props.portalUrl}>Go to the portal</CtaButton>
    </EmailLayout>
  );
}

export const EMAIL_TEMPLATES: Record<EmailTemplateKey, (props: EmailProps) => React.ReactElement> = {
  offer_completed: OfferCompleted,
  payment_thank_you: PaymentThankYou,
  portal_ready: PortalReady,
};

export async function renderEmailHtml(key: EmailTemplateKey, props: EmailProps): Promise<string> {
  const Template = EMAIL_TEMPLATES[key];
  return render(<Template {...props} />);
}
