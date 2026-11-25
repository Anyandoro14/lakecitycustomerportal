import { ArrowUpRight, CheckCircle2, Database, Loader2, Sheet, UserCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form";
import { PlaceholderTag } from "@/components/Placeholder";
import { WizardShell } from "@/components/WizardShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { config } from "@/config";
import { backend, type Lead, type PortalRecords } from "@/lib/backend";
import { formatUsd } from "@shared/domain/schedule.ts";

export default function PortalStep() {
  return (
    <WizardShell step="portal">
      {({ lead, refresh }) => (lead.portalRecords ? <PortalRecordsView lead={lead} records={lead.portalRecords} /> : <PortalEnrol lead={lead} refresh={refresh} />)}
    </WizardShell>
  );
}

function PortalEnrol({ lead, refresh }: { lead: Lead; refresh: () => Promise<void> }) {
  const [standNumber, setStandNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!standNumber.trim() || !phone.trim()) return setError("Enter your stand number and phone number.");
    setError(null);
    setBusy(true);
    try {
      await backend.enrolPortal(lead.id, { standNumber, phone });
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not set up your account.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Set up your portal account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your stand number and the phone number you gave us. We'll prepare your payment schedule and account records. <PlaceholderTag />
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={submit} noValidate className="grid gap-4 sm:max-w-md">
            <Field id="portal-stand" label="Stand number">
              <Input id="portal-stand" inputMode="numeric" autoComplete="off" placeholder="e.g. 3041" value={standNumber} onChange={(e) => setStandNumber(e.target.value)} />
            </Field>
            <Field id="portal-phone" label="Phone number" error={error ?? undefined}>
              <Input id="portal-phone" type="tel" autoComplete="tel" placeholder="+263 77 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
              Set up my account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PortalRecordsView({ lead, records }: { lead: Lead; records: PortalRecords }) {
  const cs = records.collectionSchedule;
  const firstRows = cs.rows.slice(0, 4);
  return (
    <div className="space-y-6" data-testid="portal-records">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-1 h-7 w-7 shrink-0 text-primary" />
        <div>
          <h1 className="font-serif text-3xl font-semibold">Your account records are ready</h1>
          <p className="mt-2 text-sm text-muted-foreground">Stand {lead.standNumber} · {cs.customerName}</p>
        </div>
      </div>

      <Alert className="border-dashed border-gold bg-accent/40">
        <Database className="h-4 w-4" />
        <AlertTitle>Preview data</AlertTitle>
        <AlertDescription>
          These records were prepared by mock adapters. Nothing has been written to LakeCity's collection schedule, master schedule or Odoo yet.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Sheet className="h-5 w-5 text-gold" /> Collection schedule</CardTitle>
          <CardDescription>Account {cs.accountId}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 text-sm grid-cols-2 sm:grid-cols-5">
            <div><dt className="text-xs text-muted-foreground">Price</dt><dd className="font-medium" data-testid="portal-price">{formatUsd(cs.priceCents)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Paid toward price</dt><dd className="font-medium" data-testid="portal-paid-toward-price">{formatUsd(cs.paidTowardPriceCents)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Legal fee paid</dt><dd className="font-medium">{formatUsd(cs.legalFeePaidCents)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Balance</dt><dd className="font-medium" data-testid="portal-balance">{formatUsd(cs.balanceCents)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Monthly</dt><dd className="font-medium">about {formatUsd(cs.monthlyCents)} × {cs.termMonths}</dd></div>
          </dl>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No.</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {firstRows.map((r) => (
                  <TableRow key={r.no}>
                    <TableCell>{r.no}</TableCell>
                    <TableCell>{r.label}</TableCell>
                    <TableCell>{r.dueDate}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsd(r.amountCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">Showing {firstRows.length} of {cs.rows.length} rows.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Master schedule</CardTitle>
            <CardDescription>Row {records.masterSchedule.rowId}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{records.masterSchedule.status}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Odoo</CardTitle>
            <CardDescription>Customer {records.odoo.partner.ref}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>Account {records.odoo.account.ref}</p>
            <p>Payment {records.odoo.payment.ref} · {formatUsd(records.odoo.payment.amountCents)}</p>
          </CardContent>
        </Card>
      </div>

      <section className="rounded-2xl border-2 border-gold/60 bg-accent/40 p-6">
        <h2 className="font-serif text-xl font-semibold">Your customer portal</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          LakeCity will confirm when your portal login is ready. You'll use it to view your statement and track every payment. <PlaceholderTag>TBC</PlaceholderTag>
        </p>
        <Button asChild variant="outline" className="mt-4">
          <a href={config.portalUrl} target="_blank" rel="noreferrer">
            Open the customer portal <ArrowUpRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </section>
    </div>
  );
}
