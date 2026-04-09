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
        <strong>Examples:</strong> <code>Collection Schedule - 36mo</code> (thirty-six month term),{" "}
        <code>Collection Schedule - 120mo</code> (one hundred twenty month term).
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

      <h3>Monthly calendar grid</h3>
      <p>
        All templates share the <strong>same</strong> 168-column monthly header row (Columns <strong>M</strong> through{" "}
        <strong>FX</strong>, covering <strong>5 January 2022</strong> – <strong>5 December 2035</strong>).
        Column <strong>J</strong> on each row holds the <strong>contract term</strong> (e.g. 48 months) — the term
        determines how many of the 168 columns a given contract uses, not the physical grid width.
      </p>
      <p>
        After the monthly grid: <strong>FY</strong> = Next Payment marker, <strong>FZ</strong> = TOTAL PAID,
        then Current Balance, Payment Progress, and operational columns (Receipts … Registered).
      </p>

      <h3>BNPL ledger rules (Collection Schedule)</h3>
      <p>
        Schedules follow a <strong>buy-now-pay-later style ledger</strong>: <strong>Total price</strong> (Column{" "}
        <strong>I</strong>) is the <strong>base contract price</strong>. <strong>Deposit</strong> (Column{" "}
        <strong>H</strong>) is deducted <strong>before</strong> splitting the remainder into instalments.{" "}
        <strong>Current Balance</strong> = Total price − Deposit − sum of instalment payments (Columns <strong>M</strong>{" "}
        through <strong>FX</strong>); before any instalment payments, that equals <strong>Total price − Deposit</strong>.
      </p>
      <p>
        <strong>Due dates</strong> are on the <strong>5th</strong> of each month. <strong>Payment start date</strong> (Column{" "}
        <strong>L</strong>) is per contract and not fixed globally. Use one tab per term length (12, 24, …, 120 months).
      </p>
      <p>
        Full template rules for operators: see repo{" "}
        <code className="text-xs">docs/payment-schedule-templates/BNPL_SCHEDULE_SPEC.md</code>.
      </p>

      <h3>Template setup (operator instructions)</h3>
      <p>
        Each <code>.xlsx</code> template file contains <strong>one</strong> data sheet:{" "}
        <code>Collection Schedule - {"{N}"}mo</code>. Operator setup instructions are maintained in a{" "}
        <strong>standalone document</strong>:{" "}
        <code className="text-xs">docs/payment-schedule-templates/COLLECTION_SCHEDULE_TEMPLATE_INSTRUCTIONS.md</code>{" "}
        (the "operator playbook"). Instructions are <strong>not</strong> embedded as a separate tab inside the workbook files.
      </p>

      <h3>Data layout</h3>
      <p>
        Each row is one customer: payment plan, schedule dates per instalment, and status for receipts and agreements.
        This is the <strong>single source of truth</strong> for financial data while the portal reads from Google Sheets.
      </p>
      <p>
        Key columns include Stand Number, customer details, deposit and instalment amounts (Columns H, K), payment
        start date (Column L), and 168 monthly instalment cells from Column M through FX.
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
