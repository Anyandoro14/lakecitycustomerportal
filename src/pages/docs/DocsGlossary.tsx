import DocsLayout from "@/components/docs/DocsLayout";

const terms = [
  { term: "Stand Number", definition: "Unique identifier for a land parcel listing on StandLedger.", example: '"STND-000123"' },
  { term: "Customer Category", definition: "A classification of the customer for reporting and segmentation purposes (e.g., Retail, Corporate, Diaspora, Referral).", example: '"Diaspora"' },
  { term: "Documentation Fee", definition: "Fee charged to process sale documentation and legal paperwork.", example: "150.00" },
  { term: "Total Price", definition: "Total payment amount for the land parcel including all applicable fees.", example: "4500.50" },
  { term: "Number of Installments", definition: "How many scheduled payment periods are expected under the payment plan (Column J). Also the contract term in months.", example: "48" },
  { term: "Start Date", definition: "The date from which customer payments begin. Used as the anchor for calculating due dates (Column L in the Collection Schedule).", example: '"5 Sep 2025"' },
  { term: "Next Payment Due", definition: "The next scheduled installment due date, derived from Start Date and the payment sequence (Column FY).", example: '"5 Jan 2026"' },
  { term: "Total Paid", definition: "Sum of all verified payments received to date. Deposit + SUM of monthly columns M–FX (Column FZ).", example: "1200.00" },
  { term: "Current Balance", definition: "Remaining amount owed. Calculated as Total Price minus Total Paid.", example: "3300.50" },
  { term: "Payment Progress", definition: "Percentage (0–100) of total price that has been paid.", example: "26.67" },
  { term: "Receipts", definition: "List of recorded payments with receipt references, dates, and amounts.", example: '[{ "id": "R001", "date": "5 Sep 2025", "amount": 500.00 }]' },
  { term: "Offer Received", definition: "Boolean flag indicating if an initial offer or expression of interest has been logged for the stand.", example: "true" },
  { term: "Initial Payment Completed", definition: "Boolean indicating if the down payment (deposit) has been received. The deposit is treated as Payment #1 in the contract sequence.", example: "false" },
  { term: "Agreement Status", definition: "Workflow state of the sales contract (e.g., requested, signed by vendor, signed by client).", example: '"requested"' },
  { term: "Agreement Type (VAT)", definition: 'Type of agreement governing the sale (e.g., "VAT inclusive", "VAT exempt", "Standard").', example: '"Standard"' },
  { term: "Agreement of Sale File", definition: "Link or identifier for the signed agreement document.", example: '"https://drive.file/…"' },
  { term: "Registered", definition: "Boolean indicating if the sale has been registered with the relevant legal authority.", example: "false" },
  { term: "Column K", definition: "The authoritative monthly installment amount in the Collection Schedule. Gateway-originated values are immutable.", example: "125.00" },
  { term: "Column L", definition: "The payment start date. Used as the anchor for installment due date calculations.", example: '"5 Sep 2025"' },
  { term: "Column H", definition: "The deposit (down payment) amount. Treated as Payment #1 in the contract sequence.", example: "500.00" },
  { term: "Monthly Columns (M–FX)", definition: "168 monthly instalment cells spanning January 2022 – December 2035. Each column header is the 5th of its month.", example: "—" },
  { term: "Collection Schedule tab name", definition: 'Canonical pattern: "Collection Schedule - {N}mo" (e.g. "Collection Schedule - 36mo", "Collection Schedule - 120mo"). Legacy forms accepted until renamed.', example: '"Collection Schedule - 48mo"' },
  { term: "Receipt Intake", definition: "The staging layer where payment receipts are ingested, validated (QC), and approved before being aggregated into the Collection Schedule.", example: "—" },
  { term: "QC (Quality Control)", definition: "The validation process applied to manually submitted receipts before ledger aggregation. Gateway-processed payments bypass QC and receive auto-approval.", example: "—" },
  { term: "Template Instructions", definition: "Operator playbook for setting up Excel templates. Maintained as a standalone document (COLLECTION_SCHEDULE_TEMPLATE_INSTRUCTIONS.md), not embedded as a tab inside .xlsx files.", example: "—" },
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
