import DocsLayout from "@/components/docs/DocsLayout";

const apiKeyExample = `curl -X GET https://api.standledger.com/v1/stands/STND-000123 \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`;

const oauth2Example = `POST /oauth/token HTTP/1.1
Host: auth.standledger.com
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
&scope=stands:read receipts:write`;

export default function DocsAuthentication() {
  return (
    <DocsLayout
      title="Authentication & Access"
      subtitle="How to authenticate with StandLedger APIs, manage credentials, and understand permission scopes."
      breadcrumb="Authentication"
      onThisPage={[
        { label: "Overview", id: "overview" },
        { label: "API Keys", id: "api-keys" },
        { label: "OAuth 2.0", id: "oauth2" },
        { label: "Scopes", id: "scopes" },
        { label: "Rate Limits", id: "rate-limits" },
        { label: "Sandbox", id: "sandbox" },
      ]}
    >
      <h2 id="overview">Overview</h2>
      <p>
        StandLedger supports two authentication methods for API access: <strong>API Keys</strong> for server-to-server 
        integrations, and <strong>OAuth 2.0 Client Credentials</strong> for partner applications that need scoped access.
      </p>
      <p>
        All API requests must be authenticated. Unauthenticated requests will receive a <code>401 Unauthorized</code> response.
      </p>

      <h2 id="api-keys">API Keys</h2>
      <p>
        API keys are the simplest way to authenticate. They are suitable for server-to-server integrations where the 
        key can be securely stored. Include the key in the <code>Authorization</code> header:
      </p>
      <pre><code>{apiKeyExample}</code></pre>
      <p>
        <strong>Important:</strong> API keys carry the permissions of the account that created them. Never expose keys 
        in client-side code, public repositories, or browser-based applications.
      </p>

      <h2 id="oauth2">OAuth 2.0 (Client Credentials)</h2>
      <p>
        For partner integrations that require scoped access, use the OAuth 2.0 Client Credentials flow. This issues a 
        time-limited access token with specific permission scopes.
      </p>
      <pre><code>{oauth2Example}</code></pre>
      <p>
        The token endpoint returns a JSON response containing <code>access_token</code>, <code>token_type</code>, 
        and <code>expires_in</code>. Tokens expire after 1 hour and must be refreshed.
      </p>

      <h2 id="scopes">Permission Scopes</h2>
      <table>
        <thead>
          <tr><th>Scope</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>stands:read</code></td><td>Read stand and customer payment plan data</td></tr>
          <tr><td><code>stands:write</code></td><td>Update stand status fields (limited)</td></tr>
          <tr><td><code>receipts:read</code></td><td>Read receipt and payment history</td></tr>
          <tr><td><code>receipts:write</code></td><td>Submit new receipts into the intake pipeline</td></tr>
          <tr><td><code>statements:read</code></td><td>Access monthly statement data</td></tr>
          <tr><td><code>agreements:read</code></td><td>Read agreement of sale status</td></tr>
          <tr><td><code>webhooks:manage</code></td><td>Register and manage webhook endpoints</td></tr>
        </tbody>
      </table>

      <h2 id="rate-limits">Rate Limits</h2>
      <table>
        <thead>
          <tr><th>Plan</th><th>Requests/min</th><th>Burst</th></tr>
        </thead>
        <tbody>
          <tr><td>Sandbox</td><td>60</td><td>10</td></tr>
          <tr><td>Partner</td><td>300</td><td>50</td></tr>
          <tr><td>Enterprise</td><td>1000</td><td>200</td></tr>
        </tbody>
      </table>
      <p>
        Rate-limited requests receive a <code>429 Too Many Requests</code> response with a <code>Retry-After</code> header.
      </p>

      <h2 id="sandbox">Sandbox / Testing</h2>
      <p>
        A sandbox environment is available for development and testing. Sandbox credentials can be obtained from your 
        partner onboarding contact. The sandbox uses isolated data and does not affect production records.
      </p>
      <ul>
        <li><strong>Base URL:</strong> <code>https://sandbox.api.standledger.com/v1</code></li>
        <li><strong>Test Stands:</strong> <code>STND-TEST-001</code> through <code>STND-TEST-050</code></li>
        <li><strong>Test Cards:</strong> Standard Stripe test card numbers are accepted</li>
      </ul>
    </DocsLayout>
  );
}
