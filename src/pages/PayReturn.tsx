import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle, ArrowLeft, RefreshCw } from "lucide-react";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/validation";

type StatusPayload = {
  status?: string;
  paynow_status?: string;
  amount?: number;
  stand_number?: string;
  paid?: boolean;
  error?: string;
};

const PayReturn = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reference = params.get("reference") || "";
  const express = params.get("express") === "1";
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [polls, setPolls] = useState(0);

  const load = async () => {
    if (!reference) {
      setPayload({ error: "Missing payment reference" });
      setLoading(false);
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }
      const { data, error } = await supabase.functions.invoke("paynow-status", {
        body: { reference },
      });
      if (error || data?.success === false) {
        throw new Error(data?.error || error?.message || "Could not check payment status");
      }
      setPayload(data);
    } catch (e) {
      setPayload({ error: e instanceof Error ? e.message : "Could not check payment status" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [reference]);

  useEffect(() => {
    if (!reference || payload?.paid || payload?.status === "failed" || payload?.error) return;
    if (polls >= 12) return;
    const t = window.setTimeout(() => {
      setPolls((n) => n + 1);
      load();
    }, express ? 4000 : 5000);
    return () => window.clearTimeout(t);
  }, [payload, polls, reference, express]);

  const paid = Boolean(payload?.paid || payload?.status === "completed");
  const failed = payload?.status === "failed";

  return (
    <div className="min-h-screen bg-background pb-24">
      <CustomerHeader />
      <main className="max-w-md mx-auto px-4 py-8 space-y-6">
        <button
          type="button"
          onClick={() => navigate("/index")}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to account
        </button>

        <Card>
          <CardContent className="p-6 text-center space-y-3">
            {loading ? (
              <>
                <RefreshCw className="h-10 w-10 mx-auto animate-spin text-primary" />
                <h1 className="text-xl font-bold">Checking payment…</h1>
              </>
            ) : paid ? (
              <>
                <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-600" />
                <h1 className="text-xl font-bold">Payment received</h1>
                <p className="text-sm text-muted-foreground">
                  {payload?.amount ? formatCurrency(payload.amount) : "Your payment"} for stand {payload?.stand_number} is on the ledger. No QC step is required.
                </p>
              </>
            ) : failed || payload?.error ? (
              <>
                <XCircle className="h-12 w-12 mx-auto text-destructive" />
                <h1 className="text-xl font-bold">Payment not completed</h1>
                <p className="text-sm text-muted-foreground">{payload?.error || payload?.paynow_status || "The Paynow transaction was cancelled or failed."}</p>
              </>
            ) : (
              <>
                <Clock className="h-12 w-12 mx-auto text-amber-500" />
                <h1 className="text-xl font-bold">{express ? "Approve on your phone" : "Waiting for Paynow"}</h1>
                <p className="text-sm text-muted-foreground">
                  {express
                    ? "Enter your mobile money PIN when prompted. This page updates automatically."
                    : "If you just paid, wait a few seconds. We confirm the status with Paynow before writing the receipt."}
                </p>
              </>
            )}
            {reference && (
              <p className="text-[11px] text-muted-foreground break-all">Reference {reference}</p>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={load} disabled={loading}>
            Refresh status
          </Button>
          <Button className="flex-1" onClick={() => navigate(paid ? "/index" : "/pay")}>
            {paid ? "View account" : "Try again"}
          </Button>
        </div>
      </main>
      <BottomNav />
    </div>
  );
};

export default PayReturn;
