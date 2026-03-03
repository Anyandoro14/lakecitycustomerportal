import DocsLayout from "@/components/docs/DocsLayout";

const terms = [
  { term: "Stand Number", definition: "Unique identifier for a land parcel listing on StandLedger.", example: '"STND-000123"' },
  { term: "Customer Category", definition: "A classification of the customer for reporting and segmentation purposes (e.g., Retail, Corporate, Diaspora, Referral).", example: '"Diaspora"' },
  { term: "Documentation Fee", definition: "Fee charged to process sale documentation and legal paperwork.", example: "150.00" },
  { term: "Total Price", definition: "Total payment amount for the land parcel including all applicable fees.", example: "4500.50" },
  { term: "Number of Installments", definition: "How many scheduled payment periods are expected under the payment plan.", example: "36" },
  { term: "Start Date", definition: "The date from which customer payments begin. Used as the anchor for calculating due dates (Column L in the Collection Schedule).", example: '"2025-09-05"' },
  { term: "Next Payment Due", definition: "The next scheduled installment due date, derived from Start Date and the payment sequence.", example: '"2025-01-05"' },
  { term: "Total Paid", definition: "Sum of all verified payments received to date.", example: "1200.00" },
  { term: "Current Balance", definition: "Remaining amount owed. Calculated as Total Price minus Total Paid.", example: "3300.50" },
  { term: "Payment Progress", definition: "Percentage (0–100) of total price that has been paid.", example: "26.67" },
  { term: "Receipts", definition: "List of recorded payments with receipt references, dates, and amounts.", example: '[{ "id": "R001", "date": "2025-09-05", "amount": 500.00 }]' },
  { term: "Offer Received", definition: "Boolean flag indicating if an initial offer or expression of interest has been logged for the stand.", example: "true" },
  { term: "Initial Payment Completed", definition: "Boolean indicating if the down payment (deposit) has been received. The deposit is treated as Payment #1 in the contract sequence.", example: "false" },
  { term: "Agreement Status", definition: "Workflow state of the sales contract (e.g., requested, signed by vendor, signed by client).", example: '"requested"' },
  { term: "Agreement Type (VAT)", definition: 'Type of agreement governing the sale (e.g., "VAT inclusive", "VAT exempt", "Standard").', example: '"Standard"' },
  { term: "Agreement of Sale File", definition: "Link or identifier for the signed agreement document.", example: '"https://drive.file/…"' },
  { term: "Registered", definition: "Boolean indicating if the sale has been registered with the relevant legal authority.", example: "false" },
  { term: "Column K", definition: "The authoritative monthly installment amount in the Collection Schedule. Gateway-originated values are immutable.", example: "125.00" },
  { term: "Column L", definition: "The payment start date. Used as the anchor for installment due date calculations.", example: '"2025-09-05"' },
  { term: "Column H", definition: "The deposit (down payment) amount. Treated as Payment #1 in the contract sequence.", example: "500.00" },
  { term: "Receipt Intake", definition: "The staging layer where payment receipts are ingested, validated (QC), and approved before being aggregated into the Collection Schedule.", example: "—" },
  { term: "QC (Quality Control)", definition: "The validation process applied to manually submitted receipts before ledger aggregation. Gateway-processed payments bypass QC and receive auto-approval.", example: "—" },
];

export default function DocsGlossary() {
  return (
    <DocsLayout
      title="Glossary of Terms"
      subtitle="Key terms and definitions used across the StandLedger platform. Use non-abbreviated names in schema definitions."
      breadcrumb="Overview"
      onThisPage={[{ label: "All Terms", id: "terms" }]}
    >
      <h2 id="terms">Terms</h2>
      <table>
        <thead>
          <tr>
            <th>Term</th>
            <th>Definition</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          {terms.map((t) => (
            <tr key={t.term}>
              <td className="font-medium whitespace-nowrap">{t.term}</td>
              <td>{t.definition}</td>
              <td><code>{t.example}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </DocsLayout>
  );
}
