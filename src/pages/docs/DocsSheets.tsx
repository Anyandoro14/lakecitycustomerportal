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
      <h2 id="collection-schedule">1. Collection Schedule tabs</h2>
      <p>
        The workbook uses <strong>one Collection Schedule tab per instalment term length</strong> (in months).
        Each tab holds all customers on that term and follows the same column layout.
      </p>

      <h3>Tab naming convention</h3>
      <p>A tab title must match the canonical pattern:</p>
      <pre className="rounded-md bg-muted px-4 py-3 text-sm font-mono my-2">
        Collection Schedule - {"<N>"}mo
      </pre>
      <p>
        where <code>{"<N>"}</code> is a positive integer (e.g. 12, 24, 36, 48, 60, 72, 84, 96, 120).
      </p>
      <p>
        <strong>Canonical regex:</strong> <code>{"^Collection Schedule - (\\d+)mo$"}</code> (case-insensitive in app
        helpers). The backend also accepts the transition form{" "}
        <code>{"^Collection Schedule - (\\d+) Months$"}</code>.
      </p>
      <p>
        <strong>Example:</strong> <code>Collection Schedule - 36mo</code> replaces the original <code>Collection Schedule 1</code>{" "}
        tab for the 36‑month cohort.
      </p>

      <h3>Legacy names</h3>
      <p>
        <code>Collection Schedule 1</code> and <code>Collection Schedule - N Months</code> remain accepted until tabs are
        renamed. Do not show legacy labels to customers.
      </p>

      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive mt-2 mb-4">
        Invalid tab titles are rejected. Error text is aligned with{" "}
        <code>src/lib/collection-schedule.ts</code> (<code>TAB_NAME_ERROR</code>).
      </div>

      <h3>Data layout</h3>
      <p>
        Each row is one customer: payment plan, schedule dates per instalment, and status for receipts and agreements.
        This is the <strong>single source of truth</strong> for financial data.
      </p>
      <p>
        Key columns include Stand Number, customer details, deposit and instalment amounts (Columns H, K), payment
        start date (Column L), and monthly instalment cells from Column M through the last month column for that term.
        Portal balances come from the Collection Schedule data the backend returns.
      </p>

      <h2 id="receipts-intake">2. Receipts_Intake</h2>
      <p>
        A staging sheet where payment receipts are ingested before being applied to the
        Collection Schedule. Fields include receipt reference, date (Column E is the
        authoritative payment date), amount, payer, stand number, and approval status.
      </p>
      <p>
        Receipts data is validated and scored through a Quality Control (QC) process before it
        is synced to the CollectionSchedule. Individual receipts remain{" "}
        <strong>immutable</strong> in this log. Gateway-processed payments bypass the manual QC
        pipeline and are inserted with an <code>auto-approved</code> status and a{" "}
        <code>Gateway</code> source tag.
      </p>

      <h2 id="support-request">3. SupportRequest</h2>
      <p>
        Contains support tickets logged by customers for financial/payment reconciliation or
        documentation issues. Each ticket includes a case number, customer details, issue type,
        sub-issue classification, description, and status tracking.
      </p>

      <h2 id="monthly-statements">4. MonthlyStatements</h2>
      <p>
        Auto-generated financial summaries for each customer per statement period. Each record
        captures the opening balance, payments received during the period, total payments,
        closing balance, overdue status, and days overdue. Statements are derived from the
        Collection Schedule data and are <strong>read-only</strong> for customers.
      </p>

      <h2 id="agreement-tracking">5. AgreementTracking</h2>
      <p>
        Tracks the lifecycle of agreements of sale for each stand. Fields include agreement type
        (VAT classification), signature status for both vendor (Warwickshire) and client, file
        references to signed documents, and registration status with the legal authority. This
        data flows into the customer portal's Agreement of Sale status widget.
      </p>
    </DocsLayout>
  );
}
