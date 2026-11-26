import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WizardFrame } from "@/components/stand-sales/WizardFrame";
import { standSalesApi, type PaymentView } from "@/lib/stand-sales/api";
import { paymentIsHeld } from "@/lib/stand-sales/payment-state";
import { readStandSession } from "@/lib/stand-sales/session";

export default function StandPayResultPage() {
  const [params] = useSearchParams();
  const session = readStandSession();
  const stand = params.get("stand") || session?.standNumber || "";
  const payment = params.get("payment");
  const [result, setResult] = useState<PaymentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(session && params.get("ref")));

  useEffect(() => {
    const current = readStandSession();
    if (!current || !params.get("ref")) return;
    let cancelled = false;
    standSalesApi.checkPayment(current.applicationId, current.accessToken).then((view) => {
      if (!cancelled) setResult(view);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "We couldn't check this payment.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  const held = paymentIsHeld(result);
  return (
    <WizardFrame step={2}>
      <div className="mx-auto max-w-xl space-y-4" data-testid="pay-result">
        <h1 className="font-display text-3xl">Payment result</h1>
        {payment === "not-found" && <p>We couldn't find that payment. No money was taken by this page.</p>}
        {payment === "unavailable" && <p>Card payments are not available right now. Please try again later or contact LakeCity Accounts.</p>}
        {payment === "check-later" && <p>We couldn't confirm the payment just now. Use Check payment status from your stand. Nothing new was charged by this page.</p>}
        {loading && <Loader2 className="h-6 w-6 animate-spin" aria-label="Checking payment" />}
        {result && (
          <Alert variant={result.result === "approved" || result.result === "pending" ? "default" : "destructive"} data-testid="payment-result" data-result={result.result}>
            <AlertTitle>{result.title}</AlertTitle>
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result?.result === "second_charge" && <p data-testid="second-charge">This second charge is recorded for LakeCity Accounts. Please don't pay again.</p>}
        <div className="flex flex-wrap gap-2">
          {result?.result === "approved" && stand && <Button asChild><Link to={`/stands/${stand}/welcome`}>Continue</Link></Button>}
          {stand && result?.result !== "approved" && <Button asChild variant="outline"><Link to={`/stands/${stand}/pay`}>Back to payment</Link></Button>}
          {result && !held && result.result !== "approved" && <p className="text-sm text-muted-foreground">You can try another card from the payment page. Clear message stays hidden while a payment is held.</p>}
        </div>
      </div>
    </WizardFrame>
  );
}
