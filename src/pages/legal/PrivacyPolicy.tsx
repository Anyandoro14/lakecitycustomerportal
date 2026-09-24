import { Link } from "react-router-dom";

const PrivacyPolicy = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link to="/" className="text-sm text-primary hover:underline">← Back</Link>
      <h1 className="font-serif text-4xl mt-6 mb-2">Privacy Notice</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: 13 Jul 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <p>This Privacy Notice explains how <strong>Warwickshire PVT Ltd</strong> ("Warwickshire", "we", "us") collects and uses personal data when you use StandLedger and related services (the "Service").</p>

        <h2 className="font-serif text-2xl mt-8">1. Controller</h2>
        <p>Warwickshire PVT Ltd is the data controller for personal data processed through the Service.</p>

        <h2 className="font-serif text-2xl mt-8">2. Data we collect</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Account data: name, email, phone number, login credentials.</li>
          <li>Customer/property records you upload or generate in the Service.</li>
          <li>Support communications you send us.</li>
          <li>Usage and telemetry: pages visited, actions taken, device identifiers, IP address, log data.</li>
          <li>Cookies and similar technologies (see section 9).</li>
        </ul>

        <h2 className="font-serif text-2xl mt-8">3. Purposes and legal bases</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Providing and operating the Service — performance of contract.</li>
          <li>Securing accounts, preventing fraud and abuse — legitimate interests / legal obligation.</li>
          <li>Improving the Service and troubleshooting — legitimate interests.</li>
          <li>Customer support — performance of contract / legitimate interests.</li>
          <li>Marketing communications — consent, where required.</li>
        </ul>

        <h2 className="font-serif text-2xl mt-8">4. Sharing</h2>
        <p>We share personal data with:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Service providers and subprocessors (cloud hosting, database, email/SMS delivery, analytics, support tooling).</li>
          <li>Our Merchant of Record, <strong>Paddle.com Market Ltd</strong>, for sale of the Service, subscription management, payments, tax compliance, invoicing and refunds. Paddle's own privacy notice governs data it collects at checkout.</li>
          <li>Professional advisers (legal, accounting).</li>
          <li>Authorities where required by law.</li>
        </ul>

        <h2 className="font-serif text-2xl mt-8">5. International transfers</h2>
        <p>Personal data may be transferred to and processed in countries outside your own. Where required, we rely on appropriate safeguards such as Standard Contractual Clauses or adequacy decisions.</p>

        <h2 className="font-serif text-2xl mt-8">6. Retention</h2>
        <p>We keep personal data only as long as needed for the purposes above, to comply with legal obligations, resolve disputes and enforce agreements. When no longer needed it is deleted or anonymised.</p>

        <h2 className="font-serif text-2xl mt-8">7. Your rights</h2>
        <p>Subject to your local law you may have the right to access, rectify, erase, restrict, port or object to the processing of your personal data, to withdraw consent, and to lodge a complaint with your supervisory authority. We respond within one month for requests under UK/EU GDPR.</p>

        <h2 className="font-serif text-2xl mt-8">8. Security</h2>
        <p>We apply appropriate technical and organisational measures — including encryption in transit, access controls, and audit logging — to protect personal data.</p>

        <h2 className="font-serif text-2xl mt-8">9. Cookies</h2>
        <p>We use strictly necessary cookies to keep you signed in and analytics cookies to understand usage. You can manage cookies in your browser settings.</p>

        <h2 className="font-serif text-2xl mt-8">10. Contact</h2>
        <p>For privacy questions or to exercise your rights, contact us at <a className="text-primary hover:underline" href="mailto:support@standledger.io">support@standledger.io</a>.</p>
      </section>
    </div>
  </div>
);

export default PrivacyPolicy;
