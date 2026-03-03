import DocsLayout from "@/components/docs/DocsLayout";

const columns = [
  { field: "StandNumber", type: "string", required: true, unique: true, desc: "Unique ID for a plot.", example: '"STND-000123"' },
  { field: "FirstName", type: "string", required: true, unique: false, desc: "Customer's first name.", example: '"John"' },
  { field: "LastName", type: "string", required: true, unique: false, desc: "Customer's last name.", example: '"Doe"' },
  { field: "ContactNumber", type: "string", required: true, unique: false, desc: "E.164 formatted phone number.", example: '"+263771234567"' },
  { field: "Email", type: "string", required: true, unique: false, desc: "Customer email address.", example: '"john@example.com"' },
  { field: "CustomerCategory", type: "string", required: false, unique: false, desc: "Category for reporting/segmentation.", example: '"Diaspora"' },
  { field: "DocumentationFee", type: "number", required: false, unique: false, desc: "Fee for document processing.", example: "150.00" },
  { field: "Deposit (Column H)", type: "number", required: false, unique: false, desc: "Down payment amount. Treated as Payment #1.", example: "500.00" },
  { field: "TotalPrice", type: "number", required: true, unique: false, desc: "Full amount including fees.", example: "4500.50" },
  { field: "NumberOfInstallments", type: "integer", required: false, unique: false, desc: "Count of payment periods.", example: "36" },
  { field: "MonthlyInstallment (Column K)", type: "number", required: true, unique: false, desc: "Authoritative monthly payment amount. Immutable for gateway-originated entries.", example: "125.00" },
  { field: "StartDate (Column L)", type: "date", required: true, unique: false, desc: "Date customer payments begin. Anchor for due date calculations.", example: '"2025-09-05"' },
  { field: "DateColumns (M–AW)", type: "date", required: false, unique: false, desc: "Monthly installment cells. Aggregated by calendar month.", example: '"2025-09-05"' },
  { field: "NextPaymentDue", type: "date", required: false, unique: false, desc: "Next pending payment date (derived).", example: '"2025-01-05"' },
  { field: "TotalPaid", type: "number", required: false, unique: false, desc: "Cumulative verified receipts.", example: "1200.00" },
  { field: "CurrentBalance", type: "number", required: false, unique: false, desc: "Outstanding balance = TotalPrice − TotalPaid.", example: "3300.50" },
  { field: "PaymentProgress", type: "float", required: false, unique: false, desc: "Percentage complete (0–100).", example: "26.67" },
  { field: "Receipts", type: "array", required: false, unique: false, desc: "List of payment records.", example: '[{ "id": "R001" }]' },
  { field: "OfferReceived", type: "boolean", required: false, unique: false, desc: "Offer logged?", example: "true" },
  { field: "InitialPaymentCompleted", type: "boolean", required: false, unique: false, desc: "Down payment received?", example: "false" },
  { field: "AgreementRequested", type: "boolean", required: false, unique: false, desc: "Contract requested.", example: "true" },
  { field: "AgreementSignedByWarwickshire", type: "boolean", required: false, unique: false, desc: "Signed by vendor.", example: "false" },
  { field: "AgreementSignedByClient", type: "boolean", required: false, unique: false, desc: "Signed by customer.", example: "true" },
  { field: "AgreementTypeVAT", type: "string", required: false, unique: false, desc: 'VAT model of agreement.', example: '"Standard"' },
  { field: "AgreementOfSaleFile", type: "string", required: false, unique: false, desc: "Document file URL/reference.", example: '"https://drive.file/…"' },
  { field: "Registered", type: "boolean", required: false, unique: false, desc: "Registered on title registry.", example: "false" },
];

export default function DocsDataModels() {
  return (
    <DocsLayout
      title="Collection Schedule — Field Definitions"
      subtitle="Complete column-level documentation for the Collection Schedule, StandLedger's authoritative financial ledger."
      breadcrumb="Data Models"
      onThisPage={[
        { label: "Overview", id: "overview" },
        { label: "Column Reference", id: "columns" },
        { label: "Business Rules", id: "rules" },
      ]}
    >
      <h2 id="overview">Overview</h2>
      <p>
        The <strong>Collection Schedule</strong> is a Google Sheet that serves as the authoritative source of truth for 
        all financial and payment data in StandLedger v1. Each row represents a single customer–stand relationship, 
        containing their payment plan, installment schedule, receipt history, and agreement status.
      </p>
      <p>
        External integrations (payment gateways, data pipelines, reporting tools) must interact with this data through 
        StandLedger's API layer — <strong>never directly writing to the sheet</strong>.
      </p>

      <h2 id="columns">Column Reference</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Required</th>
              <th>Unique</th>
              <th>Description</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col) => (
              <tr key={col.field}>
                <td className="font-mono text-xs whitespace-nowrap">{col.field}</td>
                <td><code>{col.type}</code></td>
                <td>{col.required ? "✓" : "—"}</td>
                <td>{col.unique ? "✓" : "—"}</td>
                <td>{col.desc}</td>
                <td><code className="text-xs">{col.example}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="rules">Business Rules</h2>
      <h3>Deposit as Payment #1</h3>
      <p>
        The system treats the Deposit (Column H) as <code>Payment #1</code> in the contract sequence. If a verified 
        deposit exists, the total payment count is incremented accordingly.
      </p>

      <h3>Installment Calculation</h3>
      <p>
        Covered months are calculated using: <code>(verified deposit + sum of monthly installments) / Column K amount</code>. 
        Overdue status triggers only when the current date exceeds the calculated next installment due date derived from 
        Column L and the payment sequence.
      </p>

      <h3>Monthly Aggregation</h3>
      <p>
        Payments are aggregated by calendar month. If multiple receipts are approved for the same stand in the same month, 
        amounts are summed into the corresponding monthly cell (M–AW). This aggregation is <strong>additive only</strong> and 
        never modifies historical data.
      </p>

      <h3>Gateway-Originated Entries</h3>
      <p>
        Payments processed via a payment gateway are <strong>auto-approved</strong> (bypass manual QC) and the resulting 
        Column K values are <strong>immutable</strong> — locked from future manual editing.
      </p>
    </DocsLayout>
  );
}
