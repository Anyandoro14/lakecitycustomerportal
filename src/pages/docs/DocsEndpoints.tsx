import DocsLayout from "@/components/docs/DocsLayout";

export default function DocsEndpoints() {
  return (
    <DocsLayout
      title="API Endpoints"
      subtitle="RESTful endpoint reference for StandLedger's core resources."
      breadcrumb="API Reference"
      onThisPage={[
        { label: "Stands", id: "stands" },
        { label: "Receipts", id: "receipts" },
        { label: "Statements", id: "statements" },
        { label: "Agreements", id: "agreements" },
      ]}
    >
      <h2 id="stands">Stands</h2>
      <table>
        <thead><tr><th>Method</th><th>Endpoint</th><th>Scope</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code>GET</code></td><td><code>/v1/stands</code></td><td><code>stands:read</code></td><td>List all stands (paginated)</td></tr>
          <tr><td><code>GET</code></td><td><code>/v1/stands/:standNumber</code></td><td><code>stands:read</code></td><td>Get a single stand's payment plan</td></tr>
          <tr><td><code>GET</code></td><td><code>/v1/stands/:standNumber/schedule</code></td><td><code>stands:read</code></td><td>Get installment schedule only</td></tr>
          <tr><td><code>GET</code></td><td><code>/v1/stands/:standNumber/receipts</code></td><td><code>receipts:read</code></td><td>List receipts for a stand</td></tr>
        </tbody>
      </table>

      <h3>Pagination</h3>
      <p>List endpoints support cursor-based pagination via <code>?cursor=xxx&limit=50</code>. Default limit is 50, maximum is 200.</p>

      <h2 id="receipts">Receipts</h2>
      <table>
        <thead><tr><th>Method</th><th>Endpoint</th><th>Scope</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code>POST</code></td><td><code>/v1/receipts</code></td><td><code>receipts:write</code></td><td>Submit a new receipt</td></tr>
          <tr><td><code>GET</code></td><td><code>/v1/receipts/:id</code></td><td><code>receipts:read</code></td><td>Get receipt by ID</td></tr>
          <tr><td><code>GET</code></td><td><code>/v1/receipts/:id/status</code></td><td><code>receipts:read</code></td><td>Check receipt QC/approval status</td></tr>
        </tbody>
      </table>

      <h3>Idempotency</h3>
      <p>
        The <code>POST /v1/receipts</code> endpoint requires an <code>Idempotency-Key</code> header. If the same key 
        is sent with identical parameters, the original response is returned. If sent with different parameters, a 
        <code>409 Conflict</code> is returned.
      </p>

      <h2 id="statements">Monthly Statements</h2>
      <table>
        <thead><tr><th>Method</th><th>Endpoint</th><th>Scope</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code>GET</code></td><td><code>/v1/stands/:standNumber/statements</code></td><td><code>statements:read</code></td><td>List monthly statements</td></tr>
          <tr><td><code>GET</code></td><td><code>/v1/statements/:id</code></td><td><code>statements:read</code></td><td>Get a single statement</td></tr>
        </tbody>
      </table>

      <h2 id="agreements">Agreements</h2>
      <table>
        <thead><tr><th>Method</th><th>Endpoint</th><th>Scope</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code>GET</code></td><td><code>/v1/stands/:standNumber/agreement</code></td><td><code>agreements:read</code></td><td>Get agreement of sale status</td></tr>
        </tbody>
      </table>
    </DocsLayout>
  );
}
