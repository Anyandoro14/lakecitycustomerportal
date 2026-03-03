import DocsLayout from "@/components/docs/DocsLayout";

const customerSchema = `{
  "standNumber": "STND-000123",
  "customer": {
    "firstName": "John",
    "lastName": "Doe",
    "contactNumber": "+263771234567",
    "email": "john@example.com",
    "category": "Diaspora"
  },
  "financials": {
    "documentationFee": 150.00,
    "totalPrice": 4500.50,
    "numberOfInstallments": 36,
    "totalPaid": 1200.00,
    "currentBalance": 3300.50,
    "paymentProgress": 26.67
  },
  "schedule": [
    { "dueDate": "2025-09-05", "status": "PAID" },
    { "dueDate": "2025-10-05", "status": "PENDING" }
  ],
  "receipts": [
    { "id": "R001", "date": "2025-09-05", "amount": 500.00, "source": "manual" }
  ],
  "agreement": {
    "type": "Standard",
    "signedByWarwickshire": false,
    "signedByClient": true,
    "fileUrl": "https://drive.file/…"
  },
  "registered": false
}`;

const receiptSchema = `{
  "id": "R001",
  "standNumber": "STND-000123",
  "payerName": "John Doe",
  "amount": 500.00,
  "currency": "USD",
  "paymentDate": "2025-09-05",
  "reference": "GW-TXN-abc123",
  "source": "gateway",
  "status": "auto-approved",
  "createdAt": "2025-09-05T10:30:00Z"
}`;

const statementSchema = `{
  "id": "stmt-uuid",
  "standNumber": "STND-000123",
  "statementMonth": "2025-09",
  "customerEmail": "john@example.com",
  "openingBalance": 3800.50,
  "paymentsReceived": [
    { "date": "2025-09-05", "amount": 500.00, "reference": "R001" }
  ],
  "totalPayments": 500.00,
  "closingBalance": 3300.50,
  "isOverdue": false,
  "daysOverdue": 0,
  "generatedAt": "2025-10-01T00:00:00Z"
}`;

export default function DocsApiReference() {
  return (
    <DocsLayout
      title="API Reference — Schemas"
      subtitle="Machine-readable JSON schema definitions for StandLedger's core resources."
      breadcrumb="API Reference"
      onThisPage={[
        { label: "CustomerPaymentPlan", id: "customer-payment-plan" },
        { label: "Receipt", id: "receipt" },
        { label: "MonthlyStatement", id: "monthly-statement" },
      ]}
    >
      <h2 id="customer-payment-plan">CustomerPaymentPlan Object</h2>
      <p>
        Represents a complete customer payment plan for a single stand. This is the primary resource returned when 
        querying customer financial data.
      </p>
      <pre><code>{customerSchema}</code></pre>

      <table>
        <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code>standNumber</code></td><td>string</td><td>Unique stand identifier</td></tr>
          <tr><td><code>customer</code></td><td>object</td><td>Customer profile (name, contact, category)</td></tr>
          <tr><td><code>financials</code></td><td>object</td><td>Financial summary (price, paid, balance, progress)</td></tr>
          <tr><td><code>schedule</code></td><td>array</td><td>Installment due dates with payment status</td></tr>
          <tr><td><code>receipts</code></td><td>array</td><td>Individual payment records with source tagging</td></tr>
          <tr><td><code>agreement</code></td><td>object</td><td>Agreement of sale status and document reference</td></tr>
          <tr><td><code>registered</code></td><td>boolean</td><td>Whether the sale has been registered legally</td></tr>
        </tbody>
      </table>

      <h2 id="receipt">Receipt Object</h2>
      <p>
        A single payment receipt. Receipts originating from a payment gateway will have <code>source: "gateway"</code> and 
        <code>status: "auto-approved"</code>. Manually submitted receipts go through QC validation.
      </p>
      <pre><code>{receiptSchema}</code></pre>

      <h2 id="monthly-statement">MonthlyStatement Object</h2>
      <p>
        A generated financial summary for one customer for one month. Read-only for customers.
      </p>
      <pre><code>{statementSchema}</code></pre>
    </DocsLayout>
  );
}
