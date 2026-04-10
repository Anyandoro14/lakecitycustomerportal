import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import CustomerHeader from "@/components/CustomerHeader";
import CustomerOverview from "@/components/CustomerOverview";
import PricingTiles from "@/components/PricingTiles";
import InfoCards from "@/components/InfoCards";
import PaymentSummary from "@/components/PaymentSummary";
import DocumentsSection from "@/components/DocumentsSection";
import PaymentHistory from "@/components/PaymentHistory";
import BottomNav from "@/components/BottomNav";
import OnboardingWizard from "@/components/OnboardingWizard";
import ArticleRibbon from "@/components/articles/ArticleRibbon";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useArticles } from "@/hooks/useArticles";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { useTenant } from "@/contexts/TenantContext";
import { RefreshCw } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [allStands, setAllStands] = useState<any[]>([]);
  const [selectedStand, setSelectedStand] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const { needsOnboarding, loading: onboardingLoading, markComplete } = useOnboarding();
  const { getUnreadArticles, dismissRibbon } = useArticles();

  // Session timeout hook
  useSessionTimeout();

  useEffect(() => {
    checkAuthAndLoadData();
  }, []);

  const checkAuthAndLoadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setLoading(false);
        navigate("/login");
        return;
      }

      const { data: internalUser } = await supabase
        .from("internal_users")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (internalUser) {
        setLoading(false);
        navigate("/internal-portal");
        return;
      }

      setIsAuthenticated(true);
    } catch (e) {
      console.error(e);
      setLoading(false);
      navigate("/login");
    }
  };

  const fetchCustomerData = useCallback(async (isRefresh = false) => {
    if (!tenantId) {
      if (!isRefresh) setLoading(false);
      return;
    }
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const { data, error } = await supabase.functions.invoke('fetch-google-sheets', {
        body: { tenant_id: tenantId },
      });

      if (error) {
        // Handle auth errors by redirecting to login
        if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
          await supabase.auth.signOut();
          navigate("/login");
          return;
        }
        throw error;
      }

      if (data?.error) {
        // Handle auth errors in response
        if (data.error.includes('Unauthorized') || data.error.includes('Invalid token')) {
          await supabase.auth.signOut();
          navigate("/login");
          return;
        }
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive"
        });
        return;
      }

      setAllStands(data.stands || []);
      setSelectedStand(data.stands?.[0] || null);
      
      if (isRefresh) {
        toast({
          title: "Data refreshed",
          description: "Your account data has been updated",
        });
      }
    } catch (error: any) {
      // Check if it's an authentication error
      const errorMessage = error?.message || '';
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('session')) {
        await supabase.auth.signOut();
        navigate("/login");
        return;
      }
      toast({
        title: "Error",
        description: "Failed to fetch your account data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, navigate, toast]);

  useEffect(() => {
    if (!isAuthenticated || !tenantId || tenantLoading) return;
    fetchCustomerData();
  }, [isAuthenticated, tenantId, tenantLoading, fetchCustomerData]);

  // If tenant finished resolving but we have no tenant (misconfig / wrong slug), stop spinning —
  // otherwise loading stays true forever because fetchCustomerData never runs without tenantId.
  useEffect(() => {
    if (!isAuthenticated || tenantLoading) return;
    if (!tenantId) {
      setLoading(false);
    }
  }, [isAuthenticated, tenantLoading, tenantId]);

  useEffect(() => {
    if (!selectedStand?.standNumber || !tenantId) return;
    const stand = selectedStand.standNumber;
    const channel = supabase
      .channel(`customer-payments-${stand}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_receipts',
          filter: `stand_number=eq.${stand}`,
        },
        () => {
          fetchCustomerData(true);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'installments' },
        () => {
          fetchCustomerData(true);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedStand?.standNumber, tenantId, fetchCustomerData]);

  if (!isAuthenticated || tenantLoading || loading || onboardingLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading your account...</p>
        </div>
      </div>
    );
  }

  // Show onboarding wizard for new users
  if (needsOnboarding) {
    return (
      <OnboardingWizard 
        onComplete={markComplete} 
        customerName={selectedStand?.customerName?.split(' ')[0]}
      />
    );
  }

  if (tenantError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">{tenantError}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Could not resolve your organization. Please try again later.</p>
          <Button onClick={() => navigate("/settings")}>Go to Settings</Button>
        </div>
      </div>
    );
  }

  if (!selectedStand) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">No account data found. Please contact support.</p>
          <Button onClick={() => navigate("/settings")}>Go to Settings</Button>
        </div>
      </div>
    );
  }

  const unreadArticles = getUnreadArticles();

  return (
    <div className="min-h-screen bg-background pb-24">
      {unreadArticles.length > 0 && (
        <ArticleRibbon articles={unreadArticles} onDismiss={dismissRibbon} />
      )}
      <CustomerHeader />
      
      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        <CustomerOverview
          customerId={selectedStand.customerId}
          customerName={selectedStand.customerName}
          standNumber={selectedStand.standNumber}
          allStands={allStands}
          onStandChange={setSelectedStand}
        />

        <PricingTiles
          totalPrice={selectedStand.totalPrice}
          deposit={selectedStand.deposit}
          isVatInclusive={selectedStand.isVatInclusive}
        />

        <InfoCards 
          standNumber={selectedStand.standNumber}
          standBalance={selectedStand.standBalance}
          lastPayment={selectedStand.lastPayment}
          lastPaymentDate={selectedStand.lastPaymentDate}
          nextPayment={selectedStand.nextPayment}
          nextPaymentDate={selectedStand.nextPaymentDate}
          isOverdue={selectedStand.isOverdue}
          daysOverdue={selectedStand.daysOverdue}
          totalPaid={selectedStand.totalPaid}
          progressPercentage={selectedStand.progressPercentage}
          allStands={allStands}
          onStandChange={setSelectedStand}
          paymentNotYetDue={selectedStand.paymentNotYetDue}
        />

        <DocumentsSection documents={{
          agreementOfSale: "/docs/agreement.pdf",
          monthlyStatement: "/docs/statement.csv",
          projectDocuments: "/docs/project-docs.pdf",
        }} />

        <PaymentSummary
          signedBySeller={selectedStand.agreementSignedByWarwickshire || false}
          signedByBuyer={selectedStand.agreementSignedByClient || false}
        />

        <PaymentHistory payments={selectedStand.paymentHistory || []} />

        <Button 
          variant="outline" 
          className="w-full h-12 text-base"
          onClick={() => fetchCustomerData(true)}
          disabled={refreshing}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? "Refreshing..." : "Refresh Data"}
        </Button>
      </main>

      <BottomNav />
    </div>
  );
};

export default Index;
