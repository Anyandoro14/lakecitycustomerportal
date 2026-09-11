import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, CreditCard, Smartphone, ShieldCheck } from "lucide-react";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { initPayment, parseAmount, formatUsd, type PayMethod } from "@/lib/paynow";

const Pay = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId, loading: tenantLoading } = useTenant();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [stand, setStand] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PayMethod>("paynow");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }
      if (tenantLoading) return;

      try {
        const { data, error } = await supabase.functions.invoke("fetch-google-sheets", {
          body: { tenant_id: tenantId },
        });
        if (error) throw error;
        if (!active) return;
        const first = data?.stands?.[0] || null;
        setStand(first);
      } catch {
        if (active) {
          toast({
            title: "Could not load your account",
            description: "Please try again in a moment.",
            variant: "destructive",
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [tenantId, tenantLoading, navigate, toast]);

  const instalment = useMemo(() => parseAmount(stand?.monthlyPayment), [stand]);
  const balance = useMemo(() => parseAmount(stand?.standBalance), [stand]);
  const minAmount = useMemo(() => {
    if (balance > 0 && balance < instalment) return balance;
    return instalment > 0 ? instalment : 1;
  }, [balance, instalment]);
  const maxAmount = balance > 0 ? balance : 100000;

  useEffect(() => {
    if (stand && !amount && minAmount > 0) setAmount(minAmount.toFixed(2));
  }, [stand, minAmount, amount]);

  const handleSubmit = async () => {
    const value = parseAmount(amount);
    if (value < minAmount) {
      toast({
        title: "Amount too low",
        description: `The minimum payment is ${formatUsd(minAmount)}.`,
        variant: "destructive",
      });
      return;
    }
    if (value > maxAmount) {
      toast({
        title: "Amount too high",
        description: `Your outstanding balance is ${formatUsd(maxAmount)}.`,
        variant: "destructive",
      });
      return;
    }
    if (method !== "paynow" && !/^[0-9+\s]{9,15}$/.test(phone.trim())) {
      toast({
        title: "Mobile number needed",
        description: "Enter the mobile number registered for this wallet.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const result = await initPayment({
        amount: value,
        method,
        phone: phone.trim(),
        standNumber: stand?.standNumber || "",
        minAmount,
        maxAmount,
      });

      if (!result?.success || result.error) {
        toast({
          title: "Payment could not start",
          description: result?.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }

      const redirect = result.redirect_url || result.browserurl;
      if (redirect) {
        window.location.href = redirect;
        return;
      }

      if (result.instructions || method === "ecocash" || method === "onemoney") {
        navigate(`/pay/return?reference=${encodeURIComponent(result.reference || "")}&express=1`);
        return;
      }

      toast({
        title: "Payment could not start",
        description: "The payment service did not return a checkout link.",
        variant: "destructive",
      });
    } catch (e: any) {
      toast({
        title: "Payment could not start",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || tenantLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <CustomerHeader />
      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        <h1 className="text-xl font-bold text-foreground">Make Payment</h1>

        <Card className="p-4 shadow-sm space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Account</span>
            <span className="font-medium text-foreground">{stand?.customerName || "—"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Property reference</span>
            <span className="font-medium text-foreground">{stand?.standNumber || "—"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Outstanding balance</span>
            <span className="font-bold text-primary">{formatUsd(balance)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Monthly instalment</span>
            <span className="font-medium text-foreground">{formatUsd(instalment)}</span>
          </div>
        </Card>

        <Card className="p-4 shadow-sm space-y-3">
          <Label htmlFor="amount">Amount to pay (USD)</Label>
          <Input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-12 text-lg"
          />
          <p className="text-xs text-muted-foreground">
            Minimum {formatUsd(minAmount)} · Maximum {formatUsd(maxAmount)}
          </p>
        </Card>

        <Card className="p-4 shadow-sm space-y-3">
          <Label>Payment method</Label>
          <RadioGroup value={method} onValueChange={(v) => setMethod(v as PayMethod)} className="space-y-2">
            <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer">
              <RadioGroupItem value="paynow" id="m-paynow" />
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="text-sm">Paynow checkout (card, EcoCash, bank)</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer">
              <RadioGroupItem value="ecocash" id="m-ecocash" />
              <Smartphone className="h-4 w-4 text-primary" />
              <span className="text-sm">EcoCash — approve with your PIN</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer">
              <RadioGroupItem value="onemoney" id="m-onemoney" />
              <Smartphone className="h-4 w-4 text-primary" />
              <span className="text-sm">OneMoney — approve with your PIN</span>
            </label>
          </RadioGroup>

          {method !== "paynow" && (
            <div className="space-y-2 pt-1">
              <Label htmlFor="phone">Mobile number</Label>
              <Input
                id="phone"
                inputMode="tel"
                placeholder="0771234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-12"
              />
            </div>
          )}
        </Card>

        <Button className="w-full h-12 text-base" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {submitting ? "Starting payment..." : `Pay ${formatUsd(parseAmount(amount))}`}
        </Button>

        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Payments are processed securely by Paynow.
        </p>
      </main>
      <BottomNav />
    </div>
  );
};

export default Pay;
