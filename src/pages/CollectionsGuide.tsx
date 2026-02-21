import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  BookOpen,
  AlertTriangle,
  Info,
  ChevronRight,
  Shield,
  DollarSign,
  Calendar,
  MessageSquare,
  Users,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import InternalNav from "@/components/InternalNav";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// ── Callout components ──────────────────────────────────────────────────────

const WarningBox = ({ children }: { children: React.ReactNode }) => (
  <div className="my-4 rounded-lg border border-orange-500/40 bg-orange-500/10 p-4">
    <div className="flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
      <div className="text-sm text-foreground">{children}</div>
    </div>
  </div>
);

const InfoBox = ({ children }: { children: React.ReactNode }) => (
  <div className="my-4 rounded-lg border border-blue-500/40 bg-blue-500/10 p-4">
    <div className="flex items-start gap-3">
      <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
      <div className="text-sm text-foreground">{children}</div>
    </div>
  </div>
);

const SuccessBox = ({ children }: { children: React.ReactNode }) => (
  <div className="my-4 rounded-lg border border-green-500/40 bg-green-500/10 p-4">
    <div className="flex items-start gap-3">
      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
      <div className="text-sm text-foreground">{children}</div>
    </div>
  </div>
);

const Example = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="my-4 rounded-lg border border-muted bg-muted/30 p-4">
    <p className="font-semibold text-sm mb-2 text-primary">{title}</p>
    <div className="text-sm text-muted-foreground">{children}</div>
  </div>
);

const StepList = ({ steps }: { steps: string[] }) => (
  <ol className="my-3 space-y-2 pl-1">
    {steps.map((step, i) => (
      <li key={i} className="flex items-start gap-3 text-sm">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
          {i + 1}
        </span>
        <span className="pt-0.5">{step}</span>
      </li>
    ))}
  </ol>
);

const VisibilityTable = ({ rows }: { rows: { item: string; admin: boolean; customer: boolean }[] }) => (
  <div className="my-4 overflow-x-auto rounded-lg border">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/50">
          <th className="px-4 py-2 text-left font-medium">Item</th>
          <th className="px-4 py-2 text-center font-medium">Admin Sees</th>
          <th className="px-4 py-2 text-center font-medium">Customer Sees</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b last:border-b-0">
            <td className="px-4 py-2">{row.item}</td>
            <td className="px-4 py-2 text-center">
              {row.admin ? <CheckCircle2 className="h-4 w-4 text-green-500 inline" /> : <XCircle className="h-4 w-4 text-red-500 inline" />}
            </td>
            <td className="px-4 py-2 text-center">
              {row.customer ? <CheckCircle2 className="h-4 w-4 text-green-500 inline" /> : <XCircle className="h-4 w-4 text-red-500 inline" />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ── Main page ───────────────────────────────────────────────────────────────

const CollectionsGuide = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isDirector, setIsDirector] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { navigate("/internal-login"); return; }
        const { data, error } = await supabase.functions.invoke("check-reporting-access");
        if (error) throw error;
        if (!data.hasAccess) { toast.error("Access denied."); navigate("/"); return; }
        setHasAccess(true);
        setIsSuperAdmin(data.isSuperAdmin);
        setIsDirector(data.isDirector || false);
      } catch {
        toast.error("Access verification failed");
        navigate("/");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6" />
            <div>
              <h1 className="text-xl font-bold">Collections Operations Guide</h1>
              <p className="text-sm text-primary-foreground/70">StandLedger Internal Reference</p>
            </div>
          </div>
          <InternalNav isSuperAdmin={isSuperAdmin} isDirector={isDirector} currentPage="collections-guide" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 pb-24 md:pb-8">
        {/* Table of Contents */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5" /> Table of Contents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <nav className="grid gap-1">
              {[
                "Overview of the Collections Process",
                "Understanding the Collection Schedule Columns",
                "Daily Use of the Collections Command Center",
                "Using AI Outreach",
                "Payment Posting & Monthly Aggregation",
                "Extensions & Governance",
                "QA & Common Mistakes",
                "Customer Experience Impact",
              ].map((title, i) => (
                <a
                  key={i}
                  href={`#section-${i + 1}`}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors"
                >
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Section {i + 1}:</span> {title}
                </a>
              ))}
            </nav>
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 1 */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section id="section-1" className="mb-10 scroll-mt-20">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Section 1: Overview of the Collections Process
          </h2>

          <h3 className="text-lg font-semibold mt-6 mb-2">The Monthly Cycle</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Every client in StandLedger has a 36-month payment plan. Payments are due on the <strong>5th of each month</strong>. The monthly cycle works as follows:
          </p>
          <StepList steps={[
            "A client signs their Agreement of Sale (AOS) and pays a deposit.",
            "The deposit is verified and recorded in Column H of the Collection Schedule.",
            "Monthly installments begin on the date specified in Column L (Payment Start Date).",
            "Each month, payments are received, verified via the Receipts Intake process, and posted to the ledger.",
            "If a payment is missed, the account becomes overdue and enters the collections workflow.",
          ]} />

          <h3 className="text-lg font-semibold mt-6 mb-2">Why the Deposit Counts as Payment #1</h3>
          <p className="text-sm text-muted-foreground mb-3">
            The deposit (Column H) is treated as the <strong>first payment</strong> in the contract sequence. This means a client who has paid only the deposit has made 1 out of 37 total payments (1 deposit + 36 installments).
          </p>
          <Example title="Example: Deposit Impact">
            <p>Client buys Stand 1234 for $18,000.</p>
            <p>Deposit paid: $500 → This is Payment #1.</p>
            <p>Monthly installment (Column K): $486.11</p>
            <p>Remaining 36 payments of $486.11 begin from the Column L start date.</p>
          </Example>

          <h3 className="text-lg font-semibold mt-6 mb-2">Installment Sequencing</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Payments are tracked across 36 monthly columns (M through AV). The system calculates "covered months" by dividing the total verified payments by the Column K installment amount. This determines how many months are paid up and when the next payment is due.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">What "Verified Payment" Means</h3>
          <p className="text-sm text-muted-foreground mb-3">
            A payment is only counted once it has been <strong>approved through the Receipts Intake process</strong>. Unapproved or pending receipts do not affect balances, overdue calculations, or sequencing.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">What Triggers Overdue Status</h3>
          <p className="text-sm text-muted-foreground mb-3">
            An account is marked overdue <strong>only when</strong>:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1 mb-3">
            <li>The current date has passed the calculated next installment due date</li>
            <li>The corresponding monthly payment cell is unpaid</li>
            <li>There is no active extension overriding the due date</li>
          </ul>
          <WarningBox>
            If only the deposit has been paid, the account is <strong>NOT</strong> overdue until the first installment due date (Column L) actually passes. Do not manually flag accounts as overdue before this date.
          </WarningBox>
        </section>

        <Separator className="my-8" />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 2 */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section id="section-2" className="mb-10 scroll-mt-20">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            Section 2: Understanding the Collection Schedule Columns
          </h2>

          <Accordion type="multiple" className="w-full">
            <AccordionItem value="col-h">
              <AccordionTrigger className="text-base font-semibold">Column H – Deposit</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-3">
                  <strong>What it represents:</strong> The initial deposit paid by the client at the time of signing the Agreement of Sale. This is the first financial commitment made.
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  <strong>How it impacts payment sequencing:</strong> The deposit is counted as Payment #1. The system adds it to the total verified payments when calculating how many months are "covered."
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  <strong>How it affects overdue logic:</strong> If the deposit is verified and the first installment date (Column L) has not yet passed, the account is NOT overdue. The deposit alone satisfies the first payment obligation.
                </p>
                <WarningBox>
                  <strong>If Column H is edited incorrectly:</strong> Changing the deposit amount will alter the covered months calculation, potentially causing false overdue flags or incorrect "Total Paid" figures. Only edit Column H if a deposit correction has been officially approved and documented.
                </WarningBox>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="col-k">
              <AccordionTrigger className="text-base font-semibold">Column K – Monthly Payment Amount</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-3">
                  <strong>What it represents:</strong> The fixed monthly installment amount the client must pay. This is the authoritative source for all installment expectations.
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  <strong>How installment expectations are calculated:</strong> Every month, the system expects exactly the Column K amount. "Covered months" = (Total Verified Payments) ÷ (Column K Amount). This determines the next due date.
                </p>
                <WarningBox>
                  <strong>Why Column K must not be altered incorrectly:</strong> Changing Column K recalculates all future installment expectations. If set too low, the system will show more months as "paid" than are actually covered. If set too high, accounts may falsely appear overdue. Only modify Column K with director-level approval.
                </WarningBox>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="col-l">
              <AccordionTrigger className="text-base font-semibold">Column L – Payment Start Date</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-3">
                  <strong>What it represents:</strong> The date from which monthly installments begin. The first installment is due on this date (or the 5th of that month).
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  <strong>How due dates are calculated:</strong> Starting from Column L, the system adds one month per installment. If Column L = "2025-01-05", then Payment 2 is due Feb 5, Payment 3 is due Mar 5, and so on.
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  <strong>Impact on overdue logic:</strong> Moving Column L forward delays overdue triggers. Moving it backward may immediately trigger overdue status for missed months.
                </p>
                <WarningBox>
                  <strong>If Column L is edited incorrectly:</strong> Changing the start date shifts the entire payment timeline. A start date in the future means no payments are expected yet, which could hide delinquent accounts. A start date in the past may create false overdue flags. Always verify with contract documentation before editing.
                </WarningBox>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Example title="Example: Incorrect Column K Edit">
            <p>Stand 5678 has Column K = $500. Admin accidentally changes it to $250.</p>
            <p>Result: The system now thinks payments cover twice as many months.</p>
            <p>The client appears fully paid when they actually owe $4,500.</p>
            <p className="font-semibold text-destructive mt-2">This error is invisible until end-of-term reconciliation.</p>
          </Example>
        </section>

        <Separator className="my-8" />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 3 */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section id="section-3" className="mb-10 scroll-mt-20">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Section 3: Daily Use of the Collections Command Center
          </h2>

          <h3 className="text-lg font-semibold mt-6 mb-2">What to Review First</h3>
          <StepList steps={[
            'Check the Summary Metrics at the top: Total Expected, Total Collected, Collection %, and High Risk count.',
            'Review the "Due Today" section — these are clients whose payment is due today and need attention.',
            'Review the "Overdue" section — sorted by severity. Start with Critical (30+ days) and work down.',
            'Check the "Extension Accounts" section for any extensions approaching expiry.',
          ]} />

          <h3 className="text-lg font-semibold mt-6 mb-2">Understanding the Sections</h3>

          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4">
                <h4 className="font-semibold mb-1">Due Today</h4>
                <p className="text-sm text-muted-foreground">
                  Lists all clients whose next installment date is today. These accounts need proactive outreach — a gentle reminder is appropriate. The "Days Since Last Payment" column helps you gauge urgency.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <h4 className="font-semibold mb-1">Overdue</h4>
                <p className="text-sm text-muted-foreground">
                  Lists all accounts past their due date with no payment. Automatically sorted by severity. Use the color coding to prioritize:
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 rounded bg-yellow-500"></span>
                    <span><strong>Yellow (1–3 days):</strong> Gentle reminder territory. Client may have forgotten.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 rounded bg-orange-500"></span>
                    <span><strong>Orange (4–10 days):</strong> Professional follow-up required. Escalate tone.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 rounded bg-destructive"></span>
                    <span><strong>Red (10–29 days):</strong> Formal escalation. Consider contractual references.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 rounded bg-red-900"></span>
                    <span><strong>Dark Red (30+ days):</strong> Critical. High risk of default. Immediate director attention required.</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <h4 className="font-semibold mb-1">Extension Accounts</h4>
                <p className="text-sm text-muted-foreground">
                  Shows clients who have been granted approved payment extensions. Monitor the "Days Remaining" column. Once an extension expires, the account reverts to standard overdue logic.
                </p>
              </CardContent>
            </Card>
          </div>

          <h3 className="text-lg font-semibold mt-6 mb-2">Customer Portal Impact</h3>
          <VisibilityTable rows={[
            { item: "Collections Dashboard", admin: true, customer: false },
            { item: "Overdue status/severity", admin: true, customer: false },
            { item: "Color-coded risk levels", admin: true, customer: false },
            { item: "AI outreach tools", admin: true, customer: false },
            { item: "Extension markers", admin: true, customer: false },
            { item: "Escalation levels", admin: true, customer: false },
            { item: "Internal notes", admin: true, customer: false },
            { item: "Payment amount due", admin: true, customer: true },
            { item: "Next payment date", admin: true, customer: true },
            { item: "Payment history", admin: true, customer: true },
            { item: "Current balance", admin: true, customer: true },
          ]} />

          <InfoBox>
            Customers see their next payment date, amount due, payment history, and current balance on their portal dashboard. They do <strong>NOT</strong> see risk levels, escalation tiers, admin notes, or any internal collections information.
          </InfoBox>
        </section>

        <Separator className="my-8" />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 4 */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section id="section-4" className="mb-10 scroll-mt-20">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            Section 4: Using AI Outreach
          </h2>

          <h3 className="text-lg font-semibold mt-6 mb-2">Tone Selection Guide</h3>
          <div className="space-y-3 mb-6">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30">Gentle Reminder</Badge>
                  <span className="text-sm text-muted-foreground">1–3 days overdue</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Friendly, non-confrontational. Assumes the client may have forgotten. Suitable for first contact after a missed payment. Does not reference contract terms.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-500/30">Professional Follow-Up</Badge>
                  <span className="text-sm text-muted-foreground">4–14 days overdue</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Polite but firm. States the overdue amount clearly and requests immediate action. May reference payment history. Suitable for repeat non-payment.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/30">Formal Escalation</Badge>
                  <span className="text-sm text-muted-foreground">15+ days overdue</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Formal tone aligned with Agreement of Sale terms. References contractual obligations. Used when previous outreach has failed. Director visibility recommended.
                </p>
              </CardContent>
            </Card>
          </div>

          <h3 className="text-lg font-semibold mt-6 mb-2">What Data AI Pulls Automatically</h3>
          <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1 mb-4">
            <li>Client name (from the Collection Schedule)</li>
            <li>Stand number</li>
            <li>Amount due / outstanding balance</li>
            <li>Due date (calculated from Column L + covered months)</li>
            <li>Days overdue</li>
            <li>Extension status (if applicable)</li>
          </ul>

          <h3 className="text-lg font-semibold mt-6 mb-2">Workflow</h3>
          <StepList steps={[
            'Click "Remind", "Follow Up", or "Escalate" on any client row.',
            "The AI generates a draft message using the selected tone and client data.",
            "Review and edit the message — you MUST read it before sending.",
            "Select the delivery channel: SMS, WhatsApp, or Email.",
            "Click Send. The message is delivered and automatically logged.",
            "The communication appears in the client's Timeline panel.",
          ]} />

          <WarningBox>
            <strong>Always review AI-generated messages before sending.</strong> The AI uses client data to personalize messages, but may occasionally produce incorrect amounts or awkward phrasing. You are responsible for the accuracy of every outbound communication.
          </WarningBox>

          <h3 className="text-lg font-semibold mt-6 mb-2">Logging & Audit Trail</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Every outbound message is logged in the <code className="bg-muted px-1 rounded">collections_outreach</code> table with: timestamp, channel, tone, message content, sender email, and delivery status. This creates a complete, auditable communication history per stand.
          </p>

          <VisibilityTable rows={[
            { item: "AI-generated messages", admin: true, customer: false },
            { item: "Outreach history/timeline", admin: true, customer: false },
            { item: "Escalation level", admin: true, customer: false },
            { item: "Admin notes on account", admin: true, customer: false },
            { item: "Received SMS/WhatsApp/Email", admin: false, customer: true },
          ]} />
        </section>

        <Separator className="my-8" />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 5 */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section id="section-5" className="mb-10 scroll-mt-20">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Section 5: Payment Posting & Monthly Aggregation
          </h2>

          <h3 className="text-lg font-semibold mt-6 mb-2">How Payments Are Summed Per Month</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Payments are aggregated by calendar month. The system uses Column E of the Receipts_Intake sheet as the authoritative payment date. Multiple receipts for the same stand in the same month are summed into the corresponding monthly cell.
          </p>

          <Example title="Example: February Aggregation">
            <p>Feb 3 — Client pays $250 → February cell = $250</p>
            <p>Feb 18 — Client pays $250 → February cell = $500 (auto-summed)</p>
            <p>Mar 5 — Client pays $500 → March cell = $500 (February unchanged)</p>
          </Example>

          <h3 className="text-lg font-semibold mt-6 mb-2">Why Manual Entries Are Not Required</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Once a receipt is approved through the Receipts Intake workflow, the system automatically posts the payment to the correct monthly cell. There is no need to manually type amounts into the Collection Schedule.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">The 5-Minute Update Window</h3>
          <p className="text-sm text-muted-foreground mb-3">
            After a receipt is approved, the system processes and posts the payment within approximately 5 minutes. During this window, the dashboard may not yet reflect the latest payment. Wait for the update before taking collections actions.
          </p>

          <InfoBox>
            If a payment appears in Receipts Intake as "Approved" but does not appear on the dashboard after 10 minutes, escalate to the system administrator.
          </InfoBox>

          <h3 className="text-lg font-semibold mt-6 mb-2">What Customers See</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Customers see their payment history as a list of dates and amounts on their portal dashboard. They see their current balance (Column AZ) and next payment date. They do NOT see the internal monthly aggregation cells or the Receipts Intake sheet.
          </p>
        </section>

        <Separator className="my-8" />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 6 */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section id="section-6" className="mb-10 scroll-mt-20">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Section 6: Extensions & Governance
          </h2>

          <h3 className="text-lg font-semibold mt-6 mb-2">How Extensions Are Approved</h3>
          <p className="text-sm text-muted-foreground mb-3">
            A payment extension is a temporary deferral of a client's due date. Extensions must be approved by a Director or Super Admin. The approved extension date overrides the standard due date for that specific period.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">How Extension Due Dates Work</h3>
          <p className="text-sm text-muted-foreground mb-3">
            When an extension is active, the overdue logic checks against the <strong>extension date</strong> instead of the standard due date. The account is only flagged overdue if the extension date has passed and no payment has been made.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">Extensions Do Not Permanently Modify the Contract</h3>
          <p className="text-sm text-muted-foreground mb-3">
            An extension is a temporary measure. It does not change the total number of installments, the monthly amount (Column K), or the overall contract value. Once the extension period ends, the standard payment schedule resumes.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">What Happens When an Extension Expires</h3>
          <p className="text-sm text-muted-foreground mb-3">
            When an extension expires, the account reverts to the standard overdue logic. If the payment was not made during the extension period, the account will immediately show as overdue with the full number of days calculated from the original due date.
          </p>

          <WarningBox>
            Do not grant extensions without proper documentation. Every extension must have an approval reference and must be recorded in the system. Undocumented extensions create audit gaps.
          </WarningBox>
        </section>

        <Separator className="my-8" />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 7 */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section id="section-7" className="mb-10 scroll-mt-20">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-primary" />
            Section 7: QA & Common Mistakes
          </h2>

          <Accordion type="multiple" className="w-full">
            <AccordionItem value="mistake-1">
              <AccordionTrigger className="text-base font-semibold">Mistake: Editing Column K without approval</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Changing the monthly installment amount recalculates all future expectations. A client who was current may suddenly appear overdue (or vice versa).
                </p>
                <SuccessBox>
                  <strong>Prevention:</strong> Only edit Column K with director-level approval. Document the reason and effective date.
                </SuccessBox>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="mistake-2">
              <AccordionTrigger className="text-base font-semibold">Mistake: Flagging accounts overdue before start date</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-2">
                  If Column L (start date) is in the future, the account cannot be overdue. Some admins mistakenly escalate accounts that haven't started yet.
                </p>
                <SuccessBox>
                  <strong>Prevention:</strong> Always check Column L before escalating. The system will show "Payment not yet due" for these accounts.
                </SuccessBox>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="mistake-3">
              <AccordionTrigger className="text-base font-semibold">Mistake: Sending outreach without reviewing the AI draft</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-2">
                  AI-generated messages may contain incorrect figures or awkward phrasing. Sending without review can damage client relationships and create legal risk.
                </p>
                <SuccessBox>
                  <strong>Prevention:</strong> Always read and edit the AI draft. Verify the amount, stand number, and tone before sending.
                </SuccessBox>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="mistake-4">
              <AccordionTrigger className="text-base font-semibold">Mistake: Double-counting the deposit</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-2">
                  The deposit (Column H) is automatically included in the total paid calculation. Manually adding it to a monthly cell would count it twice.
                </p>
                <SuccessBox>
                  <strong>Prevention:</strong> Never manually post the deposit to a monthly payment column. It is handled separately.
                </SuccessBox>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="mistake-5">
              <AccordionTrigger className="text-base font-semibold">Mistake: Escalating without checking extension status</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-2">
                  A client with an active extension is not technically overdue. Sending a formal escalation to an extension client is incorrect and damages trust.
                </p>
                <SuccessBox>
                  <strong>Prevention:</strong> Check the Extension section first. If the client has an active extension, do not escalate.
                </SuccessBox>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <h3 className="text-lg font-semibold mt-6 mb-2">Pre-Escalation Checklist</h3>
          <div className="rounded-lg border p-4 bg-muted/20">
            <ul className="space-y-2 text-sm">
              {[
                "Verified that Column L start date has passed",
                "Confirmed no active extension exists",
                "Checked that the payment was not recently approved (5-min window)",
                "Reviewed the client's timeline for recent communications",
                "Confirmed the overdue amount matches the ledger",
                "Selected the appropriate outreach tone for the severity level",
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Separator className="my-8" />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 8 */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section id="section-8" className="mb-10 scroll-mt-20">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Section 8: Customer Experience Impact
          </h2>

          <p className="text-sm text-muted-foreground mb-4">
            Every internal action has a potential impact on what the customer sees. This section maps internal actions to customer-visible changes.
          </p>

          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4">
                <h4 className="font-semibold mb-2">Approving a Receipt</h4>
                <div className="flex items-start gap-3">
                  <ArrowRight className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <div className="text-sm text-muted-foreground">
                    <p><strong>Customer sees:</strong> Updated payment history, reduced balance, updated next payment date.</p>
                    <p><strong>Customer does NOT see:</strong> Receipt approval workflow, admin who approved it, Receipts Intake sheet.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <h4 className="font-semibold mb-2">Sending AI Outreach</h4>
                <div className="flex items-start gap-3">
                  <ArrowRight className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <div className="text-sm text-muted-foreground">
                    <p><strong>Customer sees:</strong> The SMS, WhatsApp, or email message you sent.</p>
                    <p><strong>Customer does NOT see:</strong> That AI generated the message, the tone selection, escalation level, or the timeline panel.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <h4 className="font-semibold mb-2">Granting an Extension</h4>
                <div className="flex items-start gap-3">
                  <ArrowRight className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <div className="text-sm text-muted-foreground">
                    <p><strong>Customer sees:</strong> Updated next payment date reflecting the extension.</p>
                    <p><strong>Customer does NOT see:</strong> Extension approval reference, internal notes, or that an extension was formally granted.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <h4 className="font-semibold mb-2">Editing Column H, K, or L</h4>
                <div className="flex items-start gap-3">
                  <ArrowRight className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <div className="text-sm text-muted-foreground">
                    <p><strong>Customer sees:</strong> Changes to total paid, balance, next payment date, and payment amount — depending on which column was edited.</p>
                    <p><strong>Customer does NOT see:</strong> That a column was edited, who edited it, or why.</p>
                  </div>
                </div>

                <WarningBox>
                  Because customers see the downstream effects of column edits, <strong>accuracy is critical</strong>. Incorrect edits will confuse customers and generate support tickets.
                </WarningBox>
              </CardContent>
            </Card>
          </div>

          <InfoBox>
            <strong>Golden Rule:</strong> Before making any change, ask yourself: "What will the customer see as a result of this action?" If the answer involves incorrect information, stop and verify your data first.
          </InfoBox>
        </section>

        {/* Footer */}
        <Separator className="my-8" />
        <div className="text-center text-sm text-muted-foreground pb-8">
          <p>StandLedger Collections Operations Guide — Internal Use Only</p>
          <p className="mt-1">Last updated: February 2026</p>
          <Badge variant="outline" className="mt-2"><Shield className="h-3 w-3 mr-1" /> Restricted to Admin, Director, and Super Admin roles</Badge>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default CollectionsGuide;
