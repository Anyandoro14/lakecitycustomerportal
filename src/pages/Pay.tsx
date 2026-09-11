import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, Smartphone, ArrowLeft, Shield, Building2 } from "lucide-react";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/validation";
import { isPaynowEnabled, parseMoney, validatePaynowAmount, normalizeZwMobile } from "@/lib/paynow";

type CheckoutMethod = "hosted" | "ecocash" | "onemoney";

const Pay = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId } = useTenant();
  useSessionTimeout();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [stand, setStand] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<CheckoutMethod>("hosted");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPaynowEnabled()) {
      navigate("/index");
      return;
    }
    loadStand();
  }, [tenantId]);

  const loadStand = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }
      const { data, error: fnError } = await supabase.functions.invoke("fetch-google-sheets", {
        body: { tenant_id: tenantId },
      });
      if (fnError || data?.error) throw new Error(data?.error || fnError?.message || "Could not load stand");
      const first = data.stands?.[0];
      if (!first) throw new Error("No stand found on this account");
      setStand(first);
      const nextDue = parseMoney(first.nextPayment) || parseMoney(first.monthlyPayment);
      const balance = parseMoney(first.standBalance);
      const suggested = nextDue > 0 && nextDue <= balance ? nextDue : balance;
      if (suggested > 0) setAmount(suggested.toFixed(2));
    } catch (e) {
      toast({
        title: "Could not load payment details",
        description: e instanceof Error ? e.message : "Try again from the home screen",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const minInstalment = useMemo(() => parseMoney(stand?.monthlyPayment), [stand]);
  const balance = useMemo(() => parseMoney(stand?.standBalance), [stand]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const check = validatePaynowAmount(amount, minInstalment, balance);
    if (!check.ok) {
      setError(check.error || "Invalid amount");
      return;
    }
    if (method !== "hosted" && !normalizeZwMobile(phone)) {
      setError("Enter a valid EcoCash / OneMoney number (e.g. 0771234567)");
      return;
    }

    setSubmitting(true);
    try {
      const returnOrigin = window.location.origin.replace(/\/$/, "");
      const { data, error: fnError } = await supabase.functions.invoke("paynow-init", {
        body: {
          stand_number: stand.standNumber,
          amount: check.amount,
          min_amount: Math.min(minInstalment || check.amount, balance),
          max_amount: balance,
          return_origin: returnOrigin,
          return_url: `${returnOrigin}/pay/return`,
          method: method === "hosted" ? undefined : method,
          phone: method === "hosted" ? undefined : phone,
        },
      });
      if (fnError || data?.success === false || data?.error) {
        throw new Error(data?.error || fnError?.message || "Paynow could not start this payment");
      }
      const checkoutUrl = data.redirect_url || data.browserurl;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      if (data.reference && (data.express || data.instructions || data.method === "ecocash" || data.method === "onemoney")) {
        navigate(`/pay/return?reference=${encodeURIComponent(data.reference)}&express=1`);
        return;
      }
      throw new Error("Paynow did not return a checkout URL");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!stand) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">No stand available to pay.</p>
          <Button onClick={() => navigate("/index")}>Back home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <CustomerHeader />
      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        <button
          type="button"
          onClick={() => navigate("/index")}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to account
        </button>

        <div>
          <h1 className="text-2xl font-bold text-foreground">Make a payment</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Secure checkout via Paynow. Funds settle to Lake City&apos;s CABS USD account.
          </p>
        </div>

        <Card>
          <CardContent className="p-4 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{stand.customerName}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Stand</span><span className="font-medium">{stand.standNumber}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Outstanding</span><span className="font-medium">{formatCurrency(balance)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Min instalment</span><span className="font-medium">{formatCurrency(minInstalment)}</span></div>
          </CardContent>
        </Card>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Payment amount (USD)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 pl-7 text-lg font-semibold"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Payment method</Label>
            <div className="space-y-2">
              {[
                { id: "hosted" as const, icon: CreditCard, label: "Paynow checkout", desc: "Visa, Mastercard, EcoCash, bank" },
                { id: "ecocash" as const, icon: Smartphone, label: "EcoCash (PIN on phone)", desc: "USSD prompt to your handset" },
                { id: "onemoney" as const, icon: Building2, label: "OneMoney", desc: "USSD prompt to your handset" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${
                    method === m.id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <m.icon className={`h-5 w-5 ${method === m.id ? "text-primary" : "text-muted-foreground"}`} />
                  <span>
                    <span className="block text-sm font-semibold">{m.label}</span>
                    <span className="block text-xs text-muted-foreground">{m.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {method !== "hosted" && (
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile wallet number</Label>
              <Input
                id="phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0771234567"
                className="h-12"
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={submitting || balance <= 0} className="w-full h-12 text-base font-semibold">
            <Shield className="h-4 w-4 mr-2" />
            {submitting ? "Starting Paynow…" : `Pay ${amount ? formatCurrency(parseMoney(amount)) : ""}`}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            You will complete payment on Paynow. Do not close the browser until you are returned here.
          </p>
        </form>
      </main>
      <BottomNav />
    </div>
  );
};

export default Pay;
