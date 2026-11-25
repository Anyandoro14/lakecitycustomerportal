import { Download, Loader2, MailCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PlaceholderTag } from "@/components/Placeholder";
import { WizardShell } from "@/components/WizardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStand } from "@/hooks/useStand";
import { backend, type Lead, type Stand } from "@/lib/backend";
import { downloadPdf } from "@/lib/pdf/builder";
import { paymentSchedulePdf, scheduleFor } from "@/lib/pdf/documents";
import { CAMPAIGN } from "@shared/domain/campaign.ts";
import { formatCents } from "@shared/domain/schedule.ts";

export default function ScheduleStep() {
  return (
    <WizardShell step="schedule">
      {({ lead }) => <ScheduleLoader lead={lead} />}
    </WizardShell>
  );
}

function ScheduleLoader({ lead }: { lead: Lead }) {
  const stand = useStand(lead.standNumber);
  if (!stand) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />;
  return <ScheduleView lead={lead} stand={stand} />;
}

export function ScheduleTable({ lead, stand, compact }: { lead: Lead; stand: Stand; compact?: boolean }) {
  const { schedule } = scheduleFor(lead, stand);
  return (
    <div className={compact ? "max-h-80 overflow-auto rounded-md border" : "max-h-[28rem] overflow-auto rounded-md border"}>
      <Table>
        <TableHeader className="sticky top-0 bg-secondary">
          <TableRow>
            <TableHead className="w-12">No.</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Due date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {schedule.rows.map((r) => (
            <TableRow key={r.no} className={r.kind === "deposit" ? "bg-accent/50" : undefined}>
              <TableCell>{r.no}</TableCell>
              <TableCell>{r.label}</TableCell>
              <TableCell className="tabular-nums">{r.dueDate}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCents(r.amountCents)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCents(r.balanceCents)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ScheduleView({ lead, stand }: { lead: Lead; stand: Stand }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const { pricing, schedule } = scheduleFor(lead, stand);
  const firstInstalment = schedule.rows.find((r) => r.kind === "instalment");

  async function proceed() {
    setBusy(true);
    try {
      await backend.acceptSchedule(lead.id);
      navigate(`/apply/${lead.id}/payment`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Your payment schedule</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Monthly instalment = (total price incl. VAT − deposit) ÷ {schedule.termMonths} months. Amounts include VAT at{" "}
          {CAMPAIGN.vatRatePercent}%. The final instalment absorbs any rounding difference.
        </p>
      </div>

      {lead.scheduleEmailedAt && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-secondary p-4 text-sm">
          <MailCheck className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="font-medium">Schedule emailed to {lead.buyer.email}</p>
            <p className="text-xs text-muted-foreground">
              Dev mode: queued in the internal email outbox, not actually sent.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">Stand {stand.standNumber}</CardTitle>
            <CardDescription>
              {pricing.isPlaceholder && <PlaceholderTag className="mr-2">Demo figures · price TBC</PlaceholderTag>}
              Due on the {schedule.dueDay === 1 ? "1st" : "5th"} of each month <PlaceholderTag>Due day TBC</PlaceholderTag>
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => downloadPdf(await paymentSchedulePdf(lead, stand), `payment-schedule-stand-${stand.standNumber}.pdf`)}
          >
            <Download className="mr-1.5 h-4 w-4" /> Download PDF
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Total (VAT incl.)", formatCents(schedule.totalCents)],
              ["Deposit", formatCents(schedule.depositCents)],
              ["Monthly", formatCents(schedule.monthlyInstalmentCents)],
              ["First instalment due", firstInstalment?.dueDate ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted/60 p-3">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-1 font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <ScheduleTable lead={lead} stand={stand} />
        </CardContent>
      </Card>

      <Button size="lg" onClick={proceed} disabled={busy}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Continue to deposit payment
      </Button>
    </div>
  );
}
