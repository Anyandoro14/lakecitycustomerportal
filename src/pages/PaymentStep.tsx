import { CheckCircle2, ExternalLink, FlaskConical, Loader2, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PlaceholderTag } from "@/components/Placeholder";
import { WizardShell } from "@/components/WizardShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { backend, type Lead, type PaymentStart } from "@/lib/backend";
import { formatCents } from "@shared/domain/schedule.ts";

export default function PaymentStep() {
  return (
    <WizardShell step="payment">
      {({ lead, refresh }) => <PaymentView lead={lead} refresh={refresh} />}
    </WizardShell>
  );
}

function PaymentView({ lead, refresh }: { lead: Lead; refresh: () => Promise<void> }) {
  const [info, setInfo] = useState<PaymentStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const paid = lead.stage !== "form_filled";

  useEffect(() => {
    if (paid) return;
    backend.startPayment(lead.id).then(setInfo).catch((e) => setError(e instanceof Error ? e.message : "Could not start payment."));
  }, [lead.id, paid]);

  if (paid) {
    return (
      <Card>
        <CardContent className="space-y-4 px-6 py-10 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
          <h1 className="font-serif text-2xl font-semibold">Deposit received</h1>
          <p className="text-muted-foreground">
            Stand {lead.standNumber} is now reserved for you and has been taken out of available inventory.
          </p>
          <dl className="mx-auto grid max-w-md gap-2 rounded-lg bg-muted/60 p-4 text-left text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Payment reference</dt><dd className="font-medium">{lead.paymentReference}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Collection schedule account</dt><dd className="font-medium">{lead.collectionAccountId}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Customer portal account</dt><dd className="font-medium capitalize">{lead.portalStatus.replace("_", " ")}</dd></div>
          </dl>
          <Button asChild size="lg">
            <Link to={`/apply/${lead.id}/agreement`}>Sign your agreement of sale</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  async function simulate() {
    setSimulating(true);
    try {
      await backend.simulatePaymentConfirmed(lead.id);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Simulation failed.");
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Pay your deposit</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Payments are processed by ZikiMall. Your stand is reserved for you once ZikiMall confirms your payment.{" "}
          <PlaceholderTag />
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Amount due now</CardTitle>
          <CardDescription>Stand {lead.standNumber}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="font-serif text-4xl font-semibold tabular-nums">
            {info ? formatCents(info.amountCents) : <Loader2 className="h-6 w-6 animate-spin" />}
          </p>
          <Button size="lg" disabled={!info?.redirectUrl} onClick={() => info?.redirectUrl && window.location.assign(info.redirectUrl)}>
            <Lock className="mr-2 h-4 w-4" /> Pay with ZikiMall <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
          {info && !info.redirectUrl && (
            <p className="text-xs text-muted-foreground">
              ZikiMall integration is a stub: the checkout URL (ZIKIMALL_URL) is TBC, so this button is disabled. No money moves in this build.
            </p>
          )}
        </CardContent>
      </Card>

      {info?.simulationAllowed && (
        <Alert className="border-dashed border-gold bg-accent/40">
          <FlaskConical className="h-4 w-4" />
          <AlertTitle>Developer mode</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Simulate ZikiMall's "payment confirmed" callback for this lead. This marks the stand as paid and reserved.</p>
            <Button variant="outline" size="sm" onClick={simulate} disabled={simulating}>
              {simulating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simulate payment confirmed
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
