import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, Landmark, Globe2 } from "lucide-react";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";

const formatUsd = (value: unknown) => {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parsed)
    : "—";
};

const Pay = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId, loading: tenantLoading } = useTenant();

  const [loading, setLoading] = useState(true);
  const [stand, setStand] = useState<any>(null);

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
           <div className="flex justify-between text-sm gap-3">
            <span className="text-muted-foreground">Account</span>
            <span className="font-medium text-foreground">{stand?.customerName || "—"}</span>
          </div>
           <div className="flex justify-between text-sm gap-3">
            <span className="text-muted-foreground">Property reference</span>
            <span className="font-medium text-foreground">{stand?.standNumber || "—"}</span>
          </div>
           <div className="flex justify-between text-sm gap-3">
            <span className="text-muted-foreground">Outstanding balance</span>
             <span className="font-bold text-primary">{stand ? formatUsd(stand.standBalance) : "—"}</span>
          </div>
           <div className="flex justify-between text-sm gap-3">
            <span className="text-muted-foreground">Monthly instalment</span>
             <span className="font-medium text-foreground">{stand ? formatUsd(stand.monthlyPayment) : "—"}</span>
          </div>
        </Card>

        <section className="space-y-4" aria-labelledby="online-payment">
          <div>
            <h2 id="online-payment" className="text-lg font-semibold text-foreground">Pay online with ZikiMall</h2>
            <p className="text-sm text-muted-foreground">Visa, Mastercard, EcoCash or Zimswitch through ZikiMall.</p>
          </div>
          <Button asChild className="w-full h-12 text-base">
            <a href="https://zikimall.com/" target="_blank" rel="noopener noreferrer">
              Pay via ZikiMall
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
          <p className="text-sm text-muted-foreground">On ZikiMall, only payments from the UK, South Africa and Canada are working for now.</p>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-foreground">
            <li>Open <strong>All Payments</strong> → <strong>All Billers</strong> and search <strong>Warwickshire</strong>.</li>
            <li>Enter your stand number, initials and surname in the account details. <strong>Do not validate.</strong></li>
            <li>Choose a supported payment option and submit.</li>
          </ol>
        </section>

        <section className="space-y-3 border-t border-border pt-5" aria-labelledby="bank-transfers">
          <h2 id="bank-transfers" className="flex items-center gap-2 text-lg font-semibold text-foreground"><Landmark className="h-5 w-5 text-primary" /> Bank transfers</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="p-4 space-y-1 shadow-sm">
              <h3 className="font-semibold text-foreground">CABS</h3>
              <p className="text-sm text-muted-foreground">Warwickshire P/L</p>
              <p className="font-mono text-base font-semibold text-foreground select-all">112988509</p>
            </Card>
            <Card className="p-4 space-y-1 shadow-sm">
              <h3 className="font-semibold text-foreground">CBZ Holdings</h3>
              <p className="text-sm text-muted-foreground">Warwickshire Pvt Ltd</p>
              <p className="font-mono text-base font-semibold text-foreground select-all">2779454018</p>
            </Card>
          </div>
        </section>

        <section className="space-y-2 border-t border-border pt-5" aria-labelledby="remittances">
          <h2 id="remittances" className="flex items-center gap-2 text-lg font-semibold text-foreground"><Globe2 className="h-5 w-5 text-primary" /> International transfers</h2>
          <p className="text-sm text-foreground">WorldRemit · MoneyGram · Mukuru · Remitly · HelloPaisa · Western Union</p>
          <p className="text-sm text-muted-foreground">Payable to <strong className="text-foreground">Tapiwa Nyandoro</strong> and <strong className="text-foreground">Brenda Tembo</strong>.</p>
        </section>

        <section className="border-t border-border pt-5 text-sm text-foreground">
          <p className="font-semibold">After any payment, email your proof of payment to{" "}
            <a href="mailto:admin@lakecity.co.zw" className="text-primary underline underline-offset-2 break-all">admin@lakecity.co.zw</a>.
          </p>
          <p className="mt-1 text-muted-foreground">Include your property reference so we can allocate the payment to your account.</p>
        </section>
      </main>
      <BottomNav />
    </div>
  );
};

export default Pay;
