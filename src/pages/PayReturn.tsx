import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Lock, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
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

  const accent = ACCENT[info.tone] ?? ACCENT.neutral;
  const Icon = stateIcon(info.state);
  const spinning = !info.terminal && !isPaid;

  return (
    <div className="min-h-screen bg-muted/30">
      <CustomerHeader />
      <main className="max-w-md mx-auto px-4 py-10">
        <Card className="overflow-hidden border-border/60 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className={`h-1.5 w-full ${accent.bar}`} />

          <div className="flex flex-col items-center p-8">
            <div className="relative mb-6 flex h-16 w-16 items-center justify-center">
              <div className={`absolute inset-0 rounded-full border-4 ${accent.ring}`} />
              {spinning && (
                <div className={`absolute inset-0 animate-spin rounded-full border-4 ${accent.arc}`} />
              )}
              <Icon className={`h-6 w-6 ${accent.icon}`} />
            </div>

            <h1 className="mb-3 text-center font-display text-[26px] font-bold leading-tight text-primary">
              {info.title}
            </h1>

            <PaymentStatusBadge status={result?.status} className="mb-6" />

            <p className="mb-6 px-2 text-center text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>

            {result?.narration && info.state === "failed" && (
              <p className={`mb-6 w-full rounded-lg border px-3 py-2 text-xs ${toneClasses.danger}`}>
                {result.narration}
              </p>
            )}
            {error && (
              <p className="mb-6 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <AlertTriangle className="h-3 w-3" /> {error}
              </p>
            )}
            {exhausted && !isPaid && (
              <p className="mb-6 text-center text-xs text-muted-foreground">
                We have stopped checking automatically. Tap “Check status” for the latest update.
              </p>
            )}

            <div className="mb-8 w-full">
              {typeof result?.amount === "number" && result.amount > 0 && (
                <DetailRow label="Amount" value={formatUsd(result.amount)} emphasis />
              )}
              {result?.stand_number && (
                <DetailRow label="Property reference" value={result.stand_number} mono />
              )}
              {reference && <DetailRow label="Payment reference" value={reference} stacked />}
              {result?.billpay_reference && (
                <DetailRow label="BillPay reference" value={result.billpay_reference} stacked />
              )}
              {result?.paynow_reference && (
                <DetailRow label="Paynow reference" value={result.paynow_reference} mono />
              )}
              {lastUpdated && (
                <DetailRow
                  label="Last checked"
                  value={lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                />
              )}
            </div>

            <div className="w-full space-y-3">
              {canRetry && (
                <Button className="h-12 w-full rounded-xl text-sm font-semibold" onClick={() => navigate("/pay")}>
                  Try payment again
                </Button>
              )}
              {showRefresh && (
                <Button
                  className="h-12 w-full rounded-xl text-sm font-semibold"
                  onClick={checkNow}
                  disabled={checking}
                >
                  {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Check status
                </Button>
              )}
              <Button
                variant={isPaid ? "default" : "ghost"}
                className="h-11 w-full rounded-xl text-sm font-medium"
                onClick={() => navigate("/index")}
              >
                Back to my account
              </Button>
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              <Lock className="h-3 w-3" />
              Secure payment • LakeCity
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default PayReturn;
