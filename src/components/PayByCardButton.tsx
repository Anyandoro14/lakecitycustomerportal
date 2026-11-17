import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreditCard, Loader2 } from "lucide-react";
import { iveriCardEnabled, initCardPayment, submitToIveri } from "@/lib/iveri";

interface Props { standNumber: string; amountDue: number; currency?: string }

/** "Pay by card" (iVeri Lite / CBZ). Amount is prefilled with the amount due; server enforces min/max. */
export default function PayByCardButton({ standNumber, amountDue, currency = "USD" }: Props) {
  const [amount, setAmount] = useState(amountDue > 0 ? amountDue.toFixed(2) : "");
  const [step, setStep] = useState<"edit" | "confirm" | "busy">("edit");
  const [error, setError] = useState<string | null>(null);
  // One key per confirm screen: a double-click re-uses the same order; "Pay by card" again = new order.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  if (!iveriCardEnabled) return null;

  const go = async () => {
    setStep("busy"); setError(null);
    const r = await initCardPayment(amount, idempotencyKey);
    if (!r.success || !r.action || !r.fields) { setError(r.error || "Card payments are unavailable right now"); setStep("confirm"); return; }
    submitToIveri(r.action, r.fields);
  };

  return (
    <div className="space-y-3" data-testid="pay-by-card">
      {step === "edit" && (<>
        <label className="text-sm font-medium" htmlFor="card-amount">Amount ({currency})</label>
        <Input id="card-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Button className="w-full h-12 text-base" onClick={() => { setIdempotencyKey(crypto.randomUUID()); setStep("confirm"); }} disabled={!amount}>
          <CreditCard className="mr-2 h-4 w-4" /> Pay by card
        </Button>
      </>)}
      {step !== "edit" && (<>
        <div className="rounded-md border p-3 text-sm">
          <div>Stand <strong>{standNumber}</strong></div>
          <div>Amount <strong>{currency} {Number(amount).toFixed(2)}</strong></div>
          <div className="text-muted-foreground">You'll enter your card on CBZ/iVeri's secure page.</div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full h-12" onClick={go} disabled={step === "busy"}>
          {step === "busy" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Continue to secure payment
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setStep("edit")} disabled={step === "busy"}>Back</Button>
      </>)}
    </div>
  );
}
