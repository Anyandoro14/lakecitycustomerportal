import { Link } from "react-router-dom";

const RefundPolicy = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link to="/" className="text-sm text-primary hover:underline">← Back</Link>
      <h1 className="font-serif text-4xl mt-6 mb-2">Refund Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: 13 Jul 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <p><strong>Warwickshire PVT Ltd</strong> offers a <strong>30-day money-back guarantee</strong> on subscriptions to StandLedger. If you are not satisfied with your purchase, you may request a full refund within 30 days of the order date.</p>

        <h2 className="font-serif text-2xl mt-8">How to request a refund</h2>
        <p>Refunds are processed by our Merchant of Record, <strong>Paddle</strong>. To request a refund:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Visit <a className="text-primary hover:underline" href="https://paddle.net" target="_blank" rel="noreferrer">paddle.net</a> and look up your order using the email address used at checkout, or</li>
          <li>Email us at <a className="text-primary hover:underline" href="mailto:support@standledger.io">support@standledger.io</a> and we will assist with the refund request.</li>
        </ul>

        <h2 className="font-serif text-2xl mt-8">Recurring subscriptions</h2>
        <p>You can cancel your subscription at any time from your account or via paddle.net. Cancellation stops future renewals; the 30-day money-back guarantee applies to the most recent charge within the guarantee window.</p>

        <h2 className="font-serif text-2xl mt-8">Questions</h2>
        <p>If you have questions about this policy, contact <a className="text-primary hover:underline" href="mailto:support@standledger.io">support@standledger.io</a>.</p>
      </section>
    </div>
  </div>
);

export default RefundPolicy;
