import DocsLayout from "@/components/docs/DocsLayout";

const webhookPayload = `{
  "event": "receipt.approved",
  "timestamp": "2025-09-05T10:30:00Z",
  "data": {
    "receiptId": "R001",
    "standNumber": "STND-000123",
    "amount": 500.00,
    "source": "gateway",
    "status": "auto-approved"
  },
  "metadata": {
    "webhookId": "wh_abc123",
    "deliveryAttempt": 1
  }
}`;

const signatureExample = `const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}`;

export default function DocsWebhooks() {
  return (
    <DocsLayout
      title="Webhooks"
      subtitle="Receive real-time notifications when events occur in StandLedger."
      breadcrumb="API Reference"
      onThisPage={[
        { label: "Overview", id: "overview" },
        { label: "Events", id: "events" },
        { label: "Payload Format", id: "payload" },
        { label: "Signature Verification", id: "verification" },
        { label: "Retry Policy", id: "retries" },
      ]}
    >
      <h2 id="overview">Overview</h2>
      <p>
        Webhooks allow your application to receive real-time HTTP POST notifications when events occur in StandLedger. 
        Register webhook endpoints via the API or through your partner dashboard.
      </p>

      <h2 id="events">Supported Events</h2>
      <table>
        <thead><tr><th>Event</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code>receipt.created</code></td><td>A new receipt has been submitted to intake</td></tr>
          <tr><td><code>receipt.approved</code></td><td>A receipt has been approved (manual QC or auto-approved)</td></tr>
          <tr><td><code>receipt.rejected</code></td><td>A receipt failed QC validation</td></tr>
          <tr><td><code>payment.settled</code></td><td>Payment has been aggregated into the Collection Schedule</td></tr>
          <tr><td><code>statement.generated</code></td><td>A new monthly statement has been generated</td></tr>
          <tr><td><code>agreement.updated</code></td><td>Agreement of sale status has changed</td></tr>
          <tr><td><code>stand.overdue</code></td><td>A stand has entered overdue status</td></tr>
        </tbody>
      </table>

      <h2 id="payload">Payload Format</h2>
      <p>All webhook payloads follow this structure:</p>
      <pre><code>{webhookPayload}</code></pre>

      <h2 id="verification">Signature Verification</h2>
      <p>
        Each webhook request includes an <code>X-StandLedger-Signature</code> header containing an HMAC-SHA256 
        signature of the request body. Always verify this signature before processing the payload.
      </p>
      <pre><code>{signatureExample}</code></pre>

      <h2 id="retries">Retry Policy</h2>
      <p>If your endpoint returns a non-2xx response, StandLedger will retry delivery with exponential backoff:</p>
      <table>
        <thead><tr><th>Attempt</th><th>Delay</th></tr></thead>
        <tbody>
          <tr><td>1st retry</td><td>30 seconds</td></tr>
          <tr><td>2nd retry</td><td>2 minutes</td></tr>
          <tr><td>3rd retry</td><td>15 minutes</td></tr>
          <tr><td>4th retry</td><td>1 hour</td></tr>
          <tr><td>5th retry (final)</td><td>4 hours</td></tr>
        </tbody>
      </table>
      <p>After 5 failed attempts, the delivery is marked as failed and an alert is logged. Failed deliveries can be replayed from the partner dashboard.</p>
    </DocsLayout>
  );
}
