import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WizardFrame } from "@/components/stand-sales/WizardFrame";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { standSalesApi, type ApplicationView, type PaymentView } from "@/lib/stand-sales/api";
import { formatMoney } from "@/lib/stand-sales/money";
import { readStandSession } from "@/lib/stand-sales/session";

export default function StandWelcomePage() {
  const { standNumber = "" } = useParams();
  const session = readStandSession();
  const [application, setApplication] = useState<ApplicationView | null>(null);
  const [secondCharge, setSecondCharge] = useState<PaymentView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = readStandSession();
    if (!current || current.standNumber !== standNumber) return;
    standSalesApi.get(current.applicationId, current.accessToken).then(async (res) => {
      setApplication(res.application);
      if (res.application.stage === "paid") {
        const checked = await standSalesApi.checkPayment(current.applicationId, current.accessToken).catch(() => null);
        if (checked?.result === "second_charge") setSecondCharge(checked);
      }
    }).catch((err) => setError(err instanceof Error ? err.message : "Could not load your payment."));
  }, [standNumber]);

  return (
    <WizardFrame step={3}>
      {!session || session.standNumber !== standNumber ? (
        <p>Open this page from the payment step on this browser.</p>
      ) : !application && !error ? (
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading welcome" />
      ) : error ? (
        <p>{error}</p>
      ) : application?.stage !== "paid" ? (
        <p>Your payment is not confirmed yet. <Link className="underline" to={`/stands/${standNumber}/pay`}>Check payment status</Link>.</p>
      ) : (
        <section className="rounded-2xl bg-primary px-6 py-12 text-primary-foreground" data-testid="welcome">
          <h1 className="font-display text-4xl">Welcome, {application.fullName.split(" ")[0]}. Stand {application.standNumber} is reserved for you.</h1>
          <p className="mt-4 max-w-xl text-primary-foreground/80">Thank you for your payment of {formatMoney(application.paymentAmountCents)}. A thank-you email is queued for preview and is not sent from this build.</p>
          <dl className="mt-6 max-w-md space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt>Stand</dt><dd>{application.standNumber}</dd></div>
            <div className="flex justify-between gap-4"><dt>Reference</dt><dd>{application.paymentReference}</dd></div>
            <div className="flex justify-between gap-4"><dt>Paid on</dt><dd>{application.paidAt?.slice(0, 10)}</dd></div>
          </dl>
          {secondCharge && (
            <Alert variant="destructive" className="mt-6 text-left" data-testid="welcome-second-charge">
              <AlertTitle>{secondCharge.title}</AlertTitle>
              <AlertDescription>{secondCharge.message}</AlertDescription>
            </Alert>
          )}
          <Button asChild className="mt-8 bg-sl-gold text-primary hover:bg-sl-gold/90" data-testid="welcome-portal-cta">
            <Link to={`/stands/${standNumber}/portal`}>Continue to Portal & Agreement</Link>
          </Button>
          <p className="mt-4 text-sm">
            <Link className="text-sl-gold underline" to={`/stands/${standNumber}/agreement`} data-testid="welcome-agreement-link">Go straight to Agreement of Sale</Link>
          </p>
        </section>
      )}
    </WizardFrame>
  );
}
