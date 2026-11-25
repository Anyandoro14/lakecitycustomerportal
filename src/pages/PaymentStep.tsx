import { ArrowRight, CheckCircle2, ExternalLink, FlaskConical, Loader2, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LockedAmountField } from "@/components/LockedAmountField";
import { PlaceholderTag } from "@/components/Placeholder";
import { StandLayout } from "@/components/StandLayout";
import { WizardShell } from "@/components/WizardShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useStand } from "@/hooks/useStand";
import { backend, type Lead, type PaymentStart } from "@/lib/backend";

export default function PaymentStep() {
  return (
    <WizardShell step="payment" wide>
      {({ lead, refresh }) => <PaymentPane lead={lead} refresh={refresh} />}
    </WizardShell>
  );
}

function PaymentPane({ lead, refresh }: { lead: Lead; refresh: () => Promise<void> }) {
  const { stand, band } = useStand(lead.standNumber);
  const navigate = useNavigate();
  const [info, setInfo] = useState<PaymentStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const paid = lead.stage !== "form_filled";

  useEffect(() => {
    if (paid) return;
    backend.startPayment(lead.id).then(setInfo).catch((e) => setError(e instanceof Error ? e.message : "Could not start payment."));
  }, [lead.id, paid]);

  async function simulate() {
    setSimulating(true);
    try {
      await backend.simulatePaymentConfirmed(lead.id);
      await refresh();
      navigate(`/apply/${lead.id}/celebration`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Simulation failed.");
    } finally {
      setSimulating(false);
    }
  }

  if (!stand) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" aria-label="Loading" />;

  return (
    <StandLayout stand={stand} band={band}>
      {paid ? (
        <div className="space-y-4 text-center sm:text-left">
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary sm:mx-0" />
          <h2 className="font-serif text-2xl font-semibold">Payment received</h2>
          <p className="text-sm text-muted-foreground">Stand {lead.standNumber} is reserved for you. Reference {lead.paymentReference}.</p>
          <Button asChild>
            <Link to={`/apply/${lead.id}/portal`}>
              Set up your portal account <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="font-serif text-2xl font-semibold">Pay with ZikiMall</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your stand is reserved for you as soon as ZikiMall confirms your payment. <PlaceholderTag />
            </p>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {info ? (
            <LockedAmountField id="zikimall-amount" label={`Amount due now for stand ${lead.standNumber}`} amountCents={info.amountCents} />
          ) : (
            !error && <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading amount" />
          )}
          <div className="space-y-2">
            <Button size="lg" className="w-full sm:w-auto" disabled={!info?.redirectUrl} onClick={() => info?.redirectUrl && window.location.assign(info.redirectUrl)}>
              <Lock className="mr-2 h-4 w-4" /> Pay with ZikiMall <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
            {info && !info.redirectUrl && (
              <p className="text-xs text-muted-foreground">
                ZikiMall checkout is not connected yet, so this button is disabled. No money moves in this build.
              </p>
            )}
          </div>

          {info?.simulationAllowed && (
            <Alert className="border-dashed border-gold bg-accent/40">
              <FlaskConical className="h-4 w-4" />
              <AlertTitle>Developer mode</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>Simulate ZikiMall's "payment confirmed" callback. No money moves; the stand is marked as paid in this demo only.</p>
                <Button variant="outline" size="sm" onClick={simulate} disabled={simulating}>
                  {simulating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Simulate payment confirmed
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </StandLayout>
  );
}
