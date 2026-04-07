import DocsLayout from "@/components/docs/DocsLayout";

export default function DocsSheets() {
  return (
    <DocsLayout
      title="Sheets & Tabs Reference"
      subtitle="Description of each sheet (tab) in the StandLedger workbook and its role in the data lifecycle."
      breadcrumb="Data Models"
      onThisPage={[
        { label: "CollectionSchedule", id: "collection-schedule" },
        { label: "Receipts_Intake", id: "receipts-intake" },
        { label: "SupportRequest", id: "support-request" },
        { label: "MonthlyStatements", id: "monthly-statements" },
        { label: "AgreementTracking", id: "agreement-tracking" },
      ]}
    >
      <h2 id="collection-schedule">1. CollectionSchedule</h2>
      <p>
        The workbook supports <strong>multiple Collection Schedule tabs</strong>, each representing a distinct customer group.
        Every tab follows the same column layout and is treated as an independent ledger.
      </p>

      <h3>Tab Naming Convention</h3>
      <p>A tab title must match one of two patterns:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>
          <strong>Legacy:</strong> exactly <code>Collection Schedule 1</code> (the original Richcraft group).
        </li>
        <li>
          <strong>New groups:</strong> <code>{"<Group Name>"} - {"<YYYY-MM-DD>"}</code> where the date
          is <strong>on or after 2022-01-01</strong>.
        </li>
      </ul>
      <p>
        <strong>Regex:</strong>{" "}
        <code>^(.+?) - (\d{"{4}"}-\d{"{2}"}-\d{"{2}"})$</code> with date {">="} 2022-01-01, <em>or</em> exactly{" "}
        <code>Collection Schedule 1</code>.
      </p>
      <p>
        <strong>Example:</strong> <code>Greenfield Estate - 2025-06-01</code>
      </p>

      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive mt-2 mb-4">
        If a tab name does not match the pattern the backend will reject it with:<br />
        <em>"Tab must be named: Customer Group - YYYY-MM-DD (on or after 2022-01-01) or use Collection Schedule 1 for Richcraft."</em>
      </div>

      <h3>Data Layout</h3>
      <p>
        Each tab holds the entire payment schedule for its customer group. Every row represents a customer, their
        payment plan, schedule dates per installment, and status tracking for receipts and agreements. It is the
        <strong> single source of truth</strong> for financial data and should be treated as the authoritative ledger.
      </p>
      <p>
        Key columns include Stand Number, customer details, deposit and installment amounts (Columns H, K), the payment
        start date (Column L), and monthly installment cells (Columns M–AW) that aggregate receipts by calendar month.
        Balances and next-payment amounts displayed in the customer portal come directly from the Collection Schedule
        data the backend returns.
      </p>

      <h2 id="receipts-intake">2. Receipts_Intake</h2>
      <p>
        A staging sheet where payment receipts are ingested before being applied to the Collection Schedule. Fields include 
        receipt reference, date (Column E is the authoritative payment date), amount, payer, stand number, and approval status.
      </p>
      <p>
        Receipts data is validated and scored through a Quality Control (QC) process before it is synced to the 
        CollectionSchedule. Individual receipts remain <strong>immutable</strong> in this log. Gateway-processed payments 
        bypass the manual QC pipeline and are inserted with an <code>auto-approved</code> status and a <code>Gateway</code> source tag.
      </p>

      <h2 id="support-request">3. SupportRequest</h2>
      <p>
        Contains support tickets logged by customers for financial/payment reconciliation or documentation issues. Each 
        ticket includes a case number, customer details, issue type, sub-issue classification, description, and status tracking.
      </p>

      <h2 id="monthly-statements">4. MonthlyStatements</h2>
      <p>
        Auto-generated financial summaries for each customer per statement period. Each record captures the opening balance, 
        payments received during the period, total payments, closing balance, overdue status, and days overdue. Statements 
        are derived from the Collection Schedule data and are <strong>read-only</strong> for customers.
      </p>

      <h2 id="agreement-tracking">5. AgreementTracking</h2>
      <p>
        Tracks the lifecycle of agreements of sale for each stand. Fields include agreement type (VAT classification), 
        signature status for both vendor (Warwickshire) and client, file references to signed documents, and registration 
        status with the legal authority. This data flows into the customer portal's Agreement of Sale status widget.
      </p>
    </DocsLayout>
  );
}
