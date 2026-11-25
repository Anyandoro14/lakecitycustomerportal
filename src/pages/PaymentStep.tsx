import { AlertCircle, ArrowRight, CheckCircle2, CreditCard, Loader2, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LockedAmountField } from "@/components/LockedAmountField";
import { StandLayout } from "@/components/StandLayout";
import { WizardShell } from "@/components/WizardShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useStand } from "@/hooks/useStand";
import { backend, type Lead, type PaymentResultView } from "@/lib/backend";
import { PRICE_VAT_NOTE, paymentDueNowCents } from "@shared/domain/campaign.ts";
import { formatUsd } from "@shared/domain/schedule.ts";

export default function PaymentStep() {
  return (
    <WizardShell step="payment" wide>
      {({ lead }) => <PaymentPane lead={lead} />}
    </WizardShell>
  );
}

/** Full redirect: POST the signed fields to iVeri's hosted card page. Card details are never entered here. */
function submitToIveri(action: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

function PaymentPane({ lead }: { lead: Lead }) {
  const { stand, band } = useStand(lead.standNumber);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const returnedRef = params.get("ref");
  const returnedKind = params.get("kind") ?? undefined;
  const [result, setResult] = useState<PaymentResultView | null>(null);
  const [busy, setBusy] = useState<"pay" | "check" | "result" | null>(returnedRef ? "result" : null);
  const [error, setError] = useState<string | null>(null);
  const paid = lead.stage !== "form_filled";
  const amountCents = paymentDueNowCents();

  function show(view: PaymentResultView) {
    setResult(view);
    // The celebration step reloads the lead itself; refreshing here first would unmount this pane mid-navigation.
    if (view.result === "approved") navigate(`/apply/${lead.id}/celebration`, { replace: true });
  }

  useEffect(() => {
    if (!returnedRef) return;
    // The return handler applies an approved payment before sending the buyer back here.
    if (paid) {
      if (returnedRef === lead.paymentReference) navigate(`/apply/${lead.id}/celebration`, { replace: true });
      return;
    }
    let cancelled = false;
    setBusy("result");
    backend
      .paymentResult(lead.id, returnedRef, returnedKind)
      .then((view) => {
        if (!cancelled) show(view);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "We couldn't check this payment.");
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedRef, returnedKind, lead.id, lead.paymentReference, paid]);

  async function pay() {
    setBusy("pay");
    setError(null);
    setResult(null);
    try {
      const start = await backend.startPayment(lead.id);
      if (start.kind === "iveri") {
        submitToIveri(start.action, start.fields);
        return;
      }
      navigate(`/mock-iveri/${encodeURIComponent(start.reference)}?lead=${lead.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't start the payment. Please try again.");
      setBusy(null);
    }
  }

  async function check() {
    setBusy("check");
    setError(null);
    try {
      show(await backend.checkPayment(lead.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't check your payment.");
    } finally {
      setBusy(null);
    }
  }

  function clearMessage() {
    setResult(null);
    setError(null);
    setParams({}, { replace: true });
  }

  if (!stand) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" aria-label="Loading" />;

  if (paid) {
    return (
      <StandLayout stand={stand} band={band}>
        <div className="space-y-4 text-center sm:text-left">
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary sm:mx-0" />
          <h2 className="font-serif text-2xl font-semibold">Payment received</h2>
          <p className="text-sm text-muted-foreground">
            Stand {lead.standNumber} is reserved for you. Reference {lead.paymentReference}.
          </p>
          <Button asChild>
            <Link to={`/apply/${lead.id}/portal`}>
              Set up your portal account <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </StandLayout>
    );
  }

  const notApproved = result && result.result !== "approved";

  return (
    <StandLayout stand={stand} band={band}>
      <div className="space-y-6">
        <div>
          <h2 className="font-serif text-2xl font-semibold">Pay by card</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pay the down payment and legal fee by Visa or Mastercard. Stand {lead.standNumber} is reserved for you as soon as
            your bank approves the payment. Stand prices are {PRICE_VAT_NOTE}.
          </p>
        </div>

        {busy === "result" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="payment-checking">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your payment with the bank…
          </p>
        )}

        {notApproved && (
          <Alert variant={result.result === "pending" ? "default" : "destructive"} data-testid="payment-result" data-result={result.result}>
            {result.result === "pending" ? <RefreshCw className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertTitle>{result.title}</AlertTitle>
            <AlertDescription className="space-y-1">
              <p>{result.message}</p>
              {(result.result === "declined" || result.result === "cancelled" || result.result === "retry_later") && (
                <p className="text-xs">Your application and stand are unchanged.</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <LockedAmountField id="payment-amount" label={`Amount due now for stand ${lead.standNumber}`} amountCents={amountCents} />
          <Button size="lg" className="h-12 sm:h-10" onClick={() => void pay()} disabled={busy !== null} data-testid="pay-by-card">
            {busy === "pay" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
            {notApproved ? "Try again" : `Pay ${formatUsd(amountCents)} by card`}
          </Button>
        </div>

        <ul className="space-y-2 rounded-xl border bg-card p-4 text-sm sm:p-5">
          <li className="flex gap-2">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            You'll go to CBZ's secure iVeri payment page to enter your card. Your card details are never entered on or stored
            by this site.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            The amount is set by LakeCity and can't be changed. Each attempt has its own reference, so one attempt can never be
            charged twice.
          </li>
          <li className="flex gap-2">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            Once your bank approves the payment you come straight back here and move on to the next step.
          </li>
        </ul>

        <div className="flex flex-col gap-2 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">Paid but didn't come back to this page?</p>
          <div className="flex gap-2">
            {notApproved && (
              <Button variant="ghost" size="sm" onClick={clearMessage}>
                Clear message
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void check()} disabled={busy !== null} data-testid="check-payment">
              {busy === "check" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Check payment status
            </Button>
          </div>
        </div>
      </div>
    </StandLayout>
  );
}
