import DocsLayout from "@/components/docs/DocsLayout";

const step1 = `curl -X GET https://sandbox.api.standledger.com/v1/stands/STND-TEST-001 \\
  -H "Authorization: Bearer YOUR_SANDBOX_API_KEY" \\
  -H "Content-Type: application/json"`;

const step2 = `{
  "standNumber": "STND-TEST-001",
  "customer": {
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "category": "Retail"
  },
  "financials": {
    "totalPrice": 5000.00,
    "totalPaid": 1000.00,
    "currentBalance": 4000.00,
    "paymentProgress": 20.00
  }
}`;

const step3 = `curl -X POST https://sandbox.api.standledger.com/v1/receipts \\
  -H "Authorization: Bearer YOUR_SANDBOX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: unique-key-123" \\
  -d '{
    "standNumber": "STND-TEST-001",
    "amount": 500.00,
    "currency": "USD",
    "paymentDate": "2025-09-05",
    "reference": "GW-TXN-test-001",
    "source": "gateway"
  }'`;

export default function DocsQuickstart() {
  return (
    <DocsLayout
      title="Quickstart Guide"
      subtitle="Get up and running with StandLedger APIs in under 5 minutes."
      breadcrumb="Overview"
      onThisPage={[
        { label: "Prerequisites", id: "prerequisites" },
        { label: "Step 1: Get Credentials", id: "step-1" },
        { label: "Step 2: Fetch a Stand", id: "step-2" },
        { label: "Step 3: Submit a Receipt", id: "step-3" },
        { label: "Next Steps", id: "next-steps" },
      ]}
    >
      <h2 id="prerequisites">Prerequisites</h2>
      <ul>
        <li>A StandLedger partner account (contact your onboarding representative)</li>
        <li>Sandbox API credentials</li>
        <li>A REST client (curl, Postman, or equivalent)</li>
      </ul>

      <h2 id="step-1">Step 1: Obtain Sandbox Credentials</h2>
      <p>
        Request sandbox API credentials from your partner onboarding contact. You'll receive a <code>client_id</code>, 
        <code>client_secret</code>, and a sandbox API key.
      </p>
      <p>
        The sandbox base URL is: <code>https://sandbox.api.standledger.com/v1</code>
      </p>

      <h2 id="step-2">Step 2: Fetch a Stand</h2>
      <p>Make your first API call to retrieve a test stand's payment plan:</p>
      <pre><code>{step1}</code></pre>
      <p>You should receive a response like:</p>
      <pre><code>{step2}</code></pre>

      <h2 id="step-3">Step 3: Submit a Receipt</h2>
      <p>
        Submit a payment receipt. Note the <code>Idempotency-Key</code> header — this prevents duplicate processing 
        on retries.
      </p>
      <pre><code>{step3}</code></pre>
      <p>
        Gateway-sourced receipts (<code>"source": "gateway"</code>) bypass the manual QC pipeline and are 
        auto-approved into the ledger immediately.
      </p>

      <h2 id="next-steps">Next Steps</h2>
      <ul>
        <li>Review the <a href="/docs/data-models">Collection Schedule field definitions</a></li>
        <li>Explore the full <a href="/docs/api-reference">API schema reference</a></li>
        <li>Set up <a href="/docs/authentication">OAuth 2.0 authentication</a> for production</li>
        <li>Review <a href="/docs/errors">error codes</a> for proper error handling</li>
      </ul>
    </DocsLayout>
  );
}
