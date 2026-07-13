import { Link } from "react-router-dom";

const TermsOfService = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link to="/" className="text-sm text-primary hover:underline">← Back</Link>
      <h1 className="font-serif text-4xl mt-6 mb-2">Terms & Conditions</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: 13 Jul 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <h2 className="font-serif text-2xl">1. Seller</h2>
        <p>The Service is provided by <strong>Warwickshire PVT Ltd</strong> ("Warwickshire", "we", "us"), operating the StandLedger platform. By using the Service you are contracting with Warwickshire.</p>

        <h2 className="font-serif text-2xl mt-8">2. Acceptance</h2>
        <p>By creating an account or continuing to use the Service you agree to these Terms. If you do not agree, do not use the Service.</p>

        <h2 className="font-serif text-2xl mt-8">3. The Service</h2>
        <p>StandLedger is a subscription software platform for managing installment sales, customer ledgers, statements and collections for property and asset sellers.</p>

        <h2 className="font-serif text-2xl mt-8">4. Accounts</h2>
        <p>You must provide accurate registration information, keep credentials confidential, and are responsible for activity under your account. If you register on behalf of an organisation, you confirm you have authority to bind it.</p>

        <h2 className="font-serif text-2xl mt-8">5. Acceptable use</h2>
        <p>You must not misuse the Service, including: (a) using it unlawfully; (b) fraud, spam or deceptive practices; (c) infringing intellectual-property rights; (d) uploading malware, probing, scanning, scraping or otherwise interfering with the security or integrity of the Service.</p>

        <h2 className="font-serif text-2xl mt-8">6. Intellectual property</h2>
        <p>Warwickshire and its licensors retain all right, title and interest in the Service, including software, documentation and branding. We grant you a limited, non-exclusive, non-transferable right to use the Service in accordance with your plan.</p>

        <h2 className="font-serif text-2xl mt-8">7. Payments, subscriptions and taxes</h2>
        <p>Our order process is conducted by our online reseller <strong>Paddle.com</strong>. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns. Payment, billing, taxes, cancellation and refund mechanics are governed by the <a className="text-primary hover:underline" href="https://www.paddle.com/legal/checkout-buyer-terms" target="_blank" rel="noreferrer">Paddle Buyer Terms</a>.</p>

        <h2 className="font-serif text-2xl mt-8">8. User content</h2>
        <p>You retain ownership of the data you upload. You grant Warwickshire a limited licence to host, process and display that data solely to provide and improve the Service.</p>

        <h2 className="font-serif text-2xl mt-8">9. Service availability</h2>
        <p>We work to keep the Service available but do not guarantee it will be uninterrupted, timely or error-free. To the fullest extent permitted by law, we disclaim implied warranties of merchantability and fitness for a particular purpose.</p>

        <h2 className="font-serif text-2xl mt-8">10. Liability</h2>
        <p>To the fullest extent permitted by law, our aggregate liability arising out of or relating to the Service is limited to the fees you paid us in the twelve months preceding the claim. We are not liable for indirect, consequential, special, incidental or punitive damages, or lost profits, revenue, data or goodwill. Nothing limits liability for fraud, death or personal injury caused by negligence, or any liability that cannot be excluded by law.</p>

        <h2 className="font-serif text-2xl mt-8">11. Indemnity</h2>
        <p>You will indemnify Warwickshire against claims arising from your content, unlawful use of the Service, or breach of these Terms.</p>

        <h2 className="font-serif text-2xl mt-8">12. Suspension and termination</h2>
        <p>We may suspend or terminate access for material breach, non-payment, security or fraud risk, or repeated or serious policy violations. On termination your right to use the Service ends; we will provide a reasonable window to export your data before deletion.</p>

        <h2 className="font-serif text-2xl mt-8">13. Changes</h2>
        <p>We may update these Terms from time to time. Material changes will be notified in-product or by email. Continued use after changes constitutes acceptance.</p>

        <h2 className="font-serif text-2xl mt-8">14. Governing law</h2>
        <p>These Terms are governed by the laws of the jurisdiction in which Warwickshire PVT Ltd is registered, and disputes are subject to the exclusive jurisdiction of its courts, unless a mandatory local law provides otherwise.</p>

        <h2 className="font-serif text-2xl mt-8">15. Contact</h2>
        <p>Questions about these Terms: <a className="text-primary hover:underline" href="mailto:support@standledger.io">support@standledger.io</a>.</p>
      </section>
    </div>
  </div>
);

export default TermsOfService;
