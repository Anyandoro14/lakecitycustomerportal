import { AlertCircle, CheckCircle2, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentView } from "@/lib/stand-sales/api";
import { formatMoney } from "@/lib/stand-sales/money";
import { paymentIsHeld } from "@/lib/stand-sales/payment-state";

export function PaymentPanel(props: {
  standNumber: string;
  amountCents: number;
  paid: boolean;
  paymentReference?: string | null;
  result: PaymentView | null;
  error: string | null;
  busy: boolean;
  simulationAllowed: boolean;
  onPay: () => void;
  onCheck: () => void;
  onClear: () => void;
  onSimulate?: (status: number | null) => void;
}) {
  const held = paymentIsHeld(props.result) || props.result?.result === "second_charge";
  const notApproved = props.result && props.result.result !== "approved";

  if (props.paid && props.result?.result !== "second_charge") {
    return (
      <div className="space-y-4" data-testid="payment-received">
        <CheckCircle2 className="h-10 w-10 text-primary" />
        <h2 className="font-display text-2xl">Payment received</h2>
        <p className="text-sm text-muted-foreground">Stand {props.standNumber} is reserved for you. Reference {props.paymentReference}.</p>
        <Button asChild>
          <Link to={`/stands/${props.standNumber}/welcome`}>Continue</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="payment-panel">
      <div>
        <h2 className="font-display text-2xl">Pay by card</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pay the down payment and legal fee on CBZ's secure iVeri page. Card details are never entered on this site. Bank account numbers are shown as the last 4 digits only (····0018).
        </p>
      </div>
      {notApproved && (
        <Alert variant={props.result?.result === "pending" ? "default" : "destructive"} data-testid="payment-result" data-result={props.result?.result}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{props.result?.title}</AlertTitle>
          <AlertDescription>{props.result?.message}</AlertDescription>
        </Alert>
      )}
      {props.error && (
        <Alert variant="destructive">
          <AlertDescription>{props.error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="payment-amount">Amount due now for stand {props.standNumber}</Label>
          <Input id="payment-amount" readOnly tabIndex={-1} value={formatMoney(props.amountCents)} aria-readonly="true" />
        </div>
        <Button size="lg" onClick={props.onPay} disabled={props.busy || held} data-testid="pay-by-card">
          {props.busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
          {notApproved && !held ? "Try again" : "Pay $2,250.00 by card"}
        </Button>
      </div>
      {props.simulationAllowed && props.onSimulate && (
        <div className="rounded-xl border bg-card p-4" data-testid="mock-iveri">
          <p className="text-sm font-medium">iVeri TEST simulation</p>
          <p className="mt-1 text-xs text-muted-foreground">No card is charged. Pick the AuthoriseInfo status the bank should report.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[0, 4, 5, 9, 255, null].map((status) => (
              <Button key={String(status)} type="button" variant="outline" size="sm" disabled={props.busy || held} onClick={() => props.onSimulate?.(status)}>
                {status === null ? "Cancel" : `Status ${status}`}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">Paid but didn't come back to this page?</p>
        <div className="flex gap-2">
          {notApproved && !held && (
            <Button variant="ghost" size="sm" onClick={props.onClear} data-testid="clear-message">
              Clear message
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={props.onCheck} disabled={props.busy} data-testid="check-payment">
            <RefreshCw className="mr-2 h-4 w-4" />
            Check payment status
          </Button>
        </div>
      </div>
    </div>
  );
}
