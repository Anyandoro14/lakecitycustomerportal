import DocsLayout from "@/components/docs/DocsLayout";

const errors = [
  { code: "400", name: "Bad Request", desc: "The request body is malformed, missing required fields, or contains invalid values.", action: "Check request schema and field types." },
  { code: "401", name: "Unauthorized", desc: "Authentication credentials are missing, invalid, or expired.", action: "Verify API key or refresh OAuth token." },
  { code: "403", name: "Forbidden", desc: "Valid credentials but insufficient permissions for the requested resource.", action: "Check scope permissions." },
  { code: "404", name: "Not Found", desc: "The requested resource (stand, receipt, statement) does not exist.", action: "Verify the resource identifier." },
  { code: "409", name: "Conflict", desc: "A conflicting operation — e.g., duplicate receipt submission or idempotency key collision.", action: "Check idempotency key; do not retry." },
  { code: "422", name: "Unprocessable Entity", desc: "Request is well-formed but semantically invalid (e.g., payment amount exceeds balance).", action: "Review business rule constraints." },
  { code: "429", name: "Too Many Requests", desc: "Rate limit exceeded.", action: "Respect Retry-After header; implement backoff." },
  { code: "500", name: "Internal Server Error", desc: "An unexpected server-side error occurred.", action: "Retry with exponential backoff; contact support if persistent." },
  { code: "502", name: "Bad Gateway", desc: "Upstream service (e.g., Google Sheets API) is unavailable.", action: "Retry after delay." },
  { code: "503", name: "Service Unavailable", desc: "The service is temporarily down for maintenance.", action: "Check status page; retry later." },
];

const errorResponseExample = `{
  "error": {
    "code": "VALIDATION_ERROR",
    "status": 422,
    "message": "Payment amount exceeds outstanding balance",
    "details": [
      {
        "field": "amount",
        "constraint": "max",
        "value": 5000.00,
        "allowed": 3300.50
      }
    ],
    "requestId": "req_abc123xyz",
    "timestamp": "2025-09-05T10:30:00Z"
  }
}`;

export default function DocsErrors() {
  return (
    <DocsLayout
      title="Error Codes & Troubleshooting"
      subtitle="Standard error responses, HTTP status codes, and resolution guidance."
      breadcrumb="Error Codes"
      onThisPage={[
        { label: "Error Format", id: "format" },
        { label: "HTTP Status Codes", id: "status-codes" },
        { label: "Application Errors", id: "app-errors" },
      ]}
    >
      <h2 id="format">Error Response Format</h2>
      <p>
        All error responses follow a consistent JSON structure. The <code>requestId</code> should be included when 
        contacting support for troubleshooting.
      </p>
      <pre><code>{errorResponseExample}</code></pre>

      <h2 id="status-codes">HTTP Status Codes</h2>
      <table>
        <thead>
          <tr><th>Code</th><th>Name</th><th>Description</th><th>Resolution</th></tr>
        </thead>
        <tbody>
          {errors.map((e) => (
            <tr key={e.code}>
              <td><code>{e.code}</code></td>
              <td className="font-medium">{e.name}</td>
              <td>{e.desc}</td>
              <td>{e.action}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 id="app-errors">Application Error Codes</h2>
      <table>
        <thead>
          <tr><th>Code</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>VALIDATION_ERROR</code></td><td>Request data fails business rule validation</td></tr>
          <tr><td><code>DUPLICATE_RECEIPT</code></td><td>A receipt with the same reference already exists</td></tr>
          <tr><td><code>STAND_NOT_FOUND</code></td><td>The specified stand number does not exist in the ledger</td></tr>
          <tr><td><code>PAYMENT_EXCEEDS_BALANCE</code></td><td>Payment amount is greater than the outstanding balance</td></tr>
          <tr><td><code>IMMUTABLE_FIELD</code></td><td>Attempted to modify a gateway-originated, locked field</td></tr>
          <tr><td><code>QC_PENDING</code></td><td>Receipt is still in the QC validation pipeline</td></tr>
          <tr><td><code>TOKEN_EXPIRED</code></td><td>OAuth access token has expired</td></tr>
          <tr><td><code>SCOPE_INSUFFICIENT</code></td><td>Token does not have the required permission scope</td></tr>
          <tr><td><code>IDEMPOTENCY_CONFLICT</code></td><td>Idempotency key was reused with different request parameters</td></tr>
          <tr><td><code>RATE_LIMITED</code></td><td>Request throttled due to rate limiting</td></tr>
        </tbody>
      </table>
    </DocsLayout>
  );
}
