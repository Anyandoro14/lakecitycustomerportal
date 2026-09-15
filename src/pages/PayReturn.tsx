import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import CustomerHeader from "@/components/CustomerHeader";
import { supabase } from "@/integrations/supabase/client";
import { checkPaymentStatus, formatUsd, type PaymentStatusResult } from "@/lib/paynow";
import {
  normalizePaymentStatus,
  nextPollDelay,
  toneClasses,
  type PaymentJourneyState,
} from "@/lib/paynowStatus";
import PaymentStatusBadge from "@/components/PaymentStatusBadge";

const MAX_POLLS = 12;

const ACCENT: Record<string, { bar: string; ring: string; arc: string; icon: string }> = {
  success: {
    bar: "bg-primary",
    ring: "border-primary/15",
    arc: "border-primary border-t-transparent",
    icon: "text-primary",
  },
  pending: {
    bar: "bg-amber-400",
    ring: "border-amber-500/15",
    arc: "border-amber-500 border-t-transparent",
    icon: "text-amber-600",
  },
  danger: {
    bar: "bg-destructive",
    ring: "border-destructive/15",
    arc: "border-destructive border-t-transparent",
    icon: "text-destructive",
  },
  neutral: {
    bar: "bg-muted-foreground/40",
    ring: "border-border",
    arc: "border-muted-foreground/40 border-t-transparent",
    icon: "text-muted-foreground",
  },
};

const stateIcon = (state: PaymentJourneyState) => {
  switch (state) {
    case "paid":
      return CheckCircle2;
    case "failed":
    case "cancelled":
      return XCircle;
    case "reversed":
      return RotateCcw;
    case "flagged":
      return ShieldAlert;
    case "authorized":
      return Clock;
    default:
      return Clock;
  }
};

const DetailRow = ({
  label,
  value,
  mono,
  stacked,
  emphasis,
}: {
  label: string;
  value: string;
  mono?: boolean;
  stacked?: boolean;
  emphasis?: boolean;
}) =>
  stacked ? (
    <div className="flex flex-col py-3 border-b border-border/50 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
      <span className="font-mono text-[11px] font-medium text-foreground break-all">{value}</span>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          emphasis
            ? "text-lg font-semibold text-primary"
            : `text-right text-foreground font-medium ${mono ? "font-mono text-xs" : "text-sm"}`
        }
      >
        {value}
      </span>
    </div>
  );

const PayReturn = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reference = params.get("reference") || "";
  const express = params.get("express") === "1";

  const [result, setResult] = useState<PaymentStatusResult | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const stopped = useRef(false);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const info = normalizePaymentStatus(result?.status);

  const poll = useCallback(async () => {
    setChecking(true);
    const res = await checkPaymentStatus(reference);
    if (stopped.current) return;
    setChecking(false);
    setLastUpdated(new Date());

    if (res?.success === false && res.error) {
      setError(res.error);
    } else {
      setError("");
      setResult(res);
    }

    const current = normalizePaymentStatus(res?.status);
    if (res?.paid || current.terminal) return;

    if (attempt.current >= MAX_POLLS) {
      setExhausted(true);
      return;
    }
    const delay = nextPollDelay(attempt.current);
    attempt.current += 1;
    timer.current = setTimeout(poll, delay);
  }, [reference]);

  useEffect(() => {
    stopped.current = false;

    const start = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }
      if (!reference) {
        setChecking(false);
        setError("We could not find the payment reference.");
        return;
      }
      poll();
    };

    start();
    return () => {
      stopped.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reference, navigate, poll]);

  const checkNow = () => {
    if (timer.current) clearTimeout(timer.current);
    attempt.current = 0;
    setExhausted(false);
    poll();
  };

  const isPaid = !!result?.paid || info.state === "paid";
  const canRetry = ["failed", "cancelled", "reversed"].includes(info.state);
  const showRefresh = !isPaid && !canRetry;

  const description = express && info.state === "processing"
    ? "Check your phone and approve the payment with your PIN. Paynow is still processing this payment — this page checks again automatically."
    : info.description;

  return (
    <div className="min-h-screen bg-background">
      <CustomerHeader />
      <main className="max-w-md mx-auto px-4 py-8">
        <Card className="p-6 space-y-5 shadow-sm">
          <div className="text-center space-y-3">
            <StateIcon state={info.state} />
            <h1 className="text-lg font-bold text-foreground">{info.title}</h1>
            <div className="flex justify-center">
              <PaymentStatusBadge status={result?.status} />
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
            {result?.narration && info.state === "failed" && (
              <p className={`text-xs rounded-md border px-3 py-2 ${toneClasses.danger}`}>
                {result.narration}
              </p>
            )}
            {error && (
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {error}
              </p>
            )}
            {exhausted && !isPaid && (
              <p className="text-xs text-muted-foreground">
                We have stopped checking automatically. Tap “Check status” for the latest update.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border divide-y divide-border text-sm">
            {typeof result?.amount === "number" && result.amount > 0 && (
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold text-foreground">{formatUsd(result.amount)}</span>
              </div>
            )}
            {result?.stand_number && (
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Property reference</span>
                <span className="font-medium text-foreground">{result.stand_number}</span>
              </div>
            )}
            {reference && (
              <div className="flex justify-between gap-3 px-3 py-2">
                <span className="text-muted-foreground shrink-0">Payment reference</span>
                <span className="font-medium text-foreground break-all text-right">{reference}</span>
              </div>
            )}
            {result?.billpay_reference && (
              <div className="flex justify-between gap-3 px-3 py-2">
                <span className="text-muted-foreground shrink-0">BillPay reference</span>
                <span className="font-medium text-foreground break-all text-right">
                  {result.billpay_reference}
                </span>
              </div>
            )}
            {result?.paynow_reference && (
              <div className="flex justify-between gap-3 px-3 py-2">
                <span className="text-muted-foreground shrink-0">Paynow reference</span>
                <span className="font-medium text-foreground break-all text-right">
                  {result.paynow_reference}
                </span>
              </div>
            )}
            {lastUpdated && (
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Last checked</span>
                <span className="text-foreground">
                  {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {showRefresh && (
              <Button
                variant="outline"
                className="w-full h-11"
                onClick={checkNow}
                disabled={checking}
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Check status
              </Button>
            )}
            {canRetry && (
              <Button className="w-full h-11" onClick={() => navigate("/pay")}>
                Try payment again
              </Button>
            )}
            <Button
              variant={isPaid || canRetry ? (isPaid ? "default" : "outline") : "ghost"}
              className="w-full h-11"
              onClick={() => navigate("/index")}
            >
              Back to my account
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default PayReturn;
