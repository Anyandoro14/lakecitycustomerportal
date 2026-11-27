import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WizardFrame } from "@/components/stand-sales/WizardFrame";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { standSalesApi, type ApplicationView, type PaymentView } from "@/lib/stand-sales/api";
import { formatMoney } from "@/lib/stand-sales/money";
import { readStandSession } from "@/lib/stand-sales/session";
import ambienceStill from "@/assets/stand-sales/luxe/ambience-highveld-light.jpg";

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
        <section className="relative overflow-hidden rounded-2xl bg-[hsl(160_70%_9%)] px-6 py-14 text-[hsl(40_33%_96%)] md:px-12 md:py-20" data-testid="welcome">
          <img src={ambienceStill} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-[hsl(160_70%_8%/0.88)]" />
          <div className="relative max-w-2xl">
            <div className="mb-8 h-px w-16 bg-sl-gold" aria-hidden="true" />
            <h1 className="font-display text-[2rem] font-medium leading-[1.2] text-[hsl(40_33%_96%)] md:text-[3.25rem]">Welcome, <em className="italic">{application.fullName.split(" ")[0]}</em>. Stand {application.standNumber} is reserved for you.</h1>
            <p className="mt-6 max-w-xl font-body text-base leading-relaxed text-[hsl(40_33%_96%)]">Thank you for your payment of {formatMoney(application.paymentAmountCents)}. A thank-you email is queued for preview and is not sent from this build.</p>
            <dl className="mt-8 max-w-md space-y-3 font-body text-sm">
              <div className="flex justify-between gap-4 border-b border-[hsl(40_33%_96%/0.22)] py-2"><dt>Stand</dt><dd>{application.standNumber}</dd></div>
              <div className="flex justify-between gap-4 border-b border-[hsl(40_33%_96%/0.22)] py-2"><dt>Reference</dt><dd>{application.paymentReference}</dd></div>
              <div className="flex justify-between gap-4 border-b border-[hsl(40_33%_96%/0.22)] py-2"><dt>Paid on</dt><dd>{application.paidAt?.slice(0, 10)}</dd></div>
            </dl>
            {secondCharge && (
              <Alert variant="destructive" className="mt-6 text-left" data-testid="welcome-second-charge">
                <AlertTitle>{secondCharge.title}</AlertTitle>
                <AlertDescription>{secondCharge.message}</AlertDescription>
              </Alert>
            )}
            <Button asChild className="mt-10 bg-sl-gold text-primary hover:bg-sl-gold/90" data-testid="welcome-portal-cta">
              <Link to={`/stands/${standNumber}/portal`}>Continue to Portal & Agreement</Link>
            </Button>
            <p className="mt-5 font-body text-sm">
              <Link className="text-[hsl(40_33%_96%)] underline decoration-sl-gold underline-offset-4" to={`/stands/${standNumber}/agreement`} data-testid="welcome-agreement-link">Go straight to Agreement of Sale</Link>
            </p>
          </div>
        </section>
      )}
    </WizardFrame>
  );
}
