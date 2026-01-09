import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CustomerHeader from "@/components/CustomerHeader";
import CustomerOverview from "@/components/CustomerOverview";
import InfoCards from "@/components/InfoCards";
import PaymentSummary from "@/components/PaymentSummary";
import DocumentsSection from "@/components/DocumentsSection";
import PaymentHistory from "@/components/PaymentHistory";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { RefreshCw } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [allStands, setAllStands] = useState<any[]>([]);
  const [selectedStand, setSelectedStand] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Session timeout hook
  useSessionTimeout();

  useEffect(() => {
    checkAuthAndLoadData();
  }, []);

  const checkAuthAndLoadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate("/login");
      return;
    }
    
    setIsAuthenticated(true);
    await fetchCustomerData();
  };

  const fetchCustomerData = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const { data, error } = await supabase.functions.invoke('fetch-google-sheets', {
        body: {}
      });

      if (error) throw error;

      if (data.error) {
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
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch your account data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (!isAuthenticated || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading your account...</p>
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

  return (
    <div className="min-h-screen bg-background pb-20">
      <CustomerHeader />
      
      <main className="max-w-md mx-auto px-3 py-3 space-y-3">
        <CustomerOverview
          customerId={selectedStand.customerId}
          customerName={selectedStand.customerName}
          standNumber={selectedStand.standNumber}
          allStands={allStands}
          onStandChange={setSelectedStand}
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
        />

        <DocumentsSection documents={{
          agreementOfSale: "/docs/agreement.pdf",
          monthlyStatement: "/docs/statement.csv",
          projectDocuments: "/docs/project-docs.pdf",
        }} />

        <PaymentSummary
          signedBySeller={true}
          signedByBuyer={false}
        />

        <PaymentHistory payments={selectedStand.paymentHistory || []} />

        <Button 
          variant="outline" 
          className="w-full"
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
