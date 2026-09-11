import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import CustomerHeader from "@/components/CustomerHeader";
import { supabase } from "@/integrations/supabase/client";
import { checkPaymentStatus, formatUsd } from "@/lib/paynow";

type State = "waiting" | "paid" | "failed";

const MAX_POLLS = 40;

const PayReturn = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reference = params.get("reference") || "";
  const express = params.get("express") === "1";

  const [state, setState] = useState<State>("waiting");
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;

    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }
      if (!reference) {
        setState("failed");
        setMessage("We could not find the payment reference.");
        return;
      }

      for (let i = 0; i < MAX_POLLS && !stopped.current; i++) {
        const result = await checkPaymentStatus(reference);
        if (stopped.current) return;

        if (result?.success && result.paid) {
          setAmount(typeof result.amount === "number" ? result.amount : null);
          setState("paid");
          return;
        }
        const status = (result?.status || "").toLowerCase();
        if (["cancelled", "failed", "refunded", "disputed"].includes(status)) {
          setState("failed");
          setMessage("The payment was not completed.");
          return;
        }
        if (result && result.success === false && result.error) {
          setMessage(result.error);
        }
        await new Promise((r) => setTimeout(r, 4000));
      }

      if (!stopped.current) {
        setMessage("We are still waiting for confirmation. You can check again shortly.");
      }
    };

    run();
    return () => {
      stopped.current = true;
    };
  }, [reference, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <CustomerHeader />
      <main className="max-w-md mx-auto px-4 py-8">
        <Card className="p-6 text-center space-y-4 shadow-sm">
          {state === "waiting" && (
            <>
              <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
              <h1 className="text-lg font-bold text-foreground">Waiting for your payment</h1>
              <p className="text-sm text-muted-foreground">
                {express
                  ? "Check your phone and approve the payment with your PIN. This page updates automatically."
                  : "We are confirming your payment with Paynow. This page updates automatically."}
              </p>
              {message && <p className="text-xs text-muted-foreground">{message}</p>}
            </>
          )}

          {state === "paid" && (
            <>
              <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
              <h1 className="text-lg font-bold text-foreground">Payment received</h1>
              <p className="text-sm text-muted-foreground">
                {amount ? `We received ${formatUsd(amount)}. ` : ""}
                Your account will reflect this shortly.
              </p>
            </>
          )}

          {state === "failed" && (
            <>
              <XCircle className="h-10 w-10 mx-auto text-destructive" />
              <h1 className="text-lg font-bold text-foreground">Payment not completed</h1>
              <p className="text-sm text-muted-foreground">{message || "Please try again."}</p>
            </>
          )}

          <div className="space-y-2 pt-2">
            <Button className="w-full h-11" onClick={() => navigate("/index")}>
              Back to my account
            </Button>
            {state !== "paid" && (
              <Button variant="outline" className="w-full h-11" onClick={() => navigate("/pay")}>
                Try another payment
              </Button>
            )}
          </div>

          {reference && (
            <p className="text-[11px] text-muted-foreground pt-1">Reference: {reference}</p>
          )}
        </Card>
      </main>
    </div>
  );
};

export default PayReturn;
