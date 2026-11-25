import { ArrowRight, CheckCircle2, ExternalLink, FlaskConical, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LockedAmountField, LockedField } from "@/components/LockedAmountField";
import { StandLayout } from "@/components/StandLayout";
import { WizardShell } from "@/components/WizardShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useStand } from "@/hooks/useStand";
import { backend, type Lead, type PaymentStart } from "@/lib/backend";
import { PRICE_VAT_NOTE } from "@shared/domain/campaign.ts";
import { PROOF_OF_PAYMENT_NOTE, ZIKIMALL, zikimallSteps } from "@shared/domain/payment-methods.ts";

const POLL_MS = 5000;

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

  // Confirmation is automatic (ZikiMall/CBZ -> payment-confirmed handler). Watch the lead and move on when it lands.
  useEffect(() => {
    if (paid) return;
    const t = setInterval(() => void refresh().catch(() => undefined), POLL_MS);
    return () => clearInterval(t);
  }, [paid, refresh]);

  useEffect(() => {
    if (paid && lead.paidAt && Date.now() - Date.parse(lead.paidAt) < 60_000) navigate(`/apply/${lead.id}/celebration`);
  }, [paid, lead.paidAt, lead.id, navigate]);

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
              Pay the down payment and legal fee online at ZikiMall. Your stand is reserved for you as soon as the payment is
              confirmed. Stand prices are {PRICE_VAT_NOTE}.
            </p>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {info ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <LockedField
                id="zikimall-account"
                label="Your ZikiMall account number"
                value={info.accountNumber}
                copyLabel="Copy account number"
                hint="Your stand number. Enter it exactly as shown."
              />
              <LockedAmountField id="zikimall-amount" label={`Amount due now for stand ${lead.standNumber}`} amountCents={info.amountCents} />
            </div>
          ) : (
            !error && <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading payment details" />
          )}

          <div className="space-y-2">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <a href={ZIKIMALL.url} target="_blank" rel="noopener noreferrer" data-testid="zikimall-link">
                Open zikimall.com <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Powered by {ZIKIMALL.poweredBy}. Funds settle to the {ZIKIMALL.payee}{" "}
              {ZIKIMALL.settlementAccountMasked} account.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <h3 className="font-semibold">How to pay</h3>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm" data-testid="zikimall-steps">
              {zikimallSteps(lead.standNumber).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="mt-3 text-sm font-medium">{PROOF_OF_PAYMENT_NOTE}</p>
          </div>

          <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="awaiting-confirmation">
            <RefreshCw className="h-4 w-4 animate-spin [animation-duration:3s]" /> This page moves on automatically when ZikiMall/CBZ
            confirms your payment.
          </p>

          {info?.simulationAllowed && (
            <Alert className="border-dashed border-gold bg-accent/40">
              <FlaskConical className="h-4 w-4" />
              <AlertTitle>Demo mode</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  Simulate a successful ZikiMall/CBZ confirmation from the mock adapter. It runs the real payment handler: the
                  stand leaves available inventory, the thank-you email is queued and the wizard moves on. No money moves.
                </p>
                <Button variant="outline" size="sm" onClick={simulate} disabled={simulating}>
                  {simulating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Simulate ZikiMall payment confirmation
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </StandLayout>
  );
}
