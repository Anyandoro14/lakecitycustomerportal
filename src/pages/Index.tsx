import { useState, useEffect } from "react";
import CustomerHeader from "@/components/CustomerHeader";
import CustomerOverview from "@/components/CustomerOverview";
import InfoCards from "@/components/InfoCards";
import PaymentSummary from "@/components/PaymentSummary";
import DocumentsSection from "@/components/DocumentsSection";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const Index = () => {
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState("");
  const [customerData, setCustomerData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchCustomerData = async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-google-sheets', {
        body: { customerId: id }
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

      setCustomerData(data);
      toast({
        title: "Success",
        description: "Customer data loaded successfully"
      });
    } catch (error) {
      console.error('Error fetching customer data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch customer data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customerId.trim()) {
      fetchCustomerData(customerId.trim());
    }
  };

  if (!customerData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Customer Portal</h1>
            <p className="text-muted-foreground">Enter your customer ID to view your account</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="text"
              placeholder="Customer ID (e.g., 00E9557)"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full"
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : "View Account"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <CustomerHeader />
      
      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        <CustomerOverview
          customerId={customerData.customerId}
          customerName={customerData.customerName}
        />

        <InfoCards
          standNumber={customerData.standNumber}
          standBalance={customerData.standBalance}
          lastPayment={customerData.lastPayment}
          nextPayment={customerData.nextPayment}
        />

        <PaymentSummary
          currentBalance={customerData.currentBalance}
          lastDueDate={customerData.lastDueDate}
          monthlyPayment={customerData.monthlyPayment}
          nextDueDate={customerData.nextDueDate}
        />

        <DocumentsSection documents={{
          agreementOfSale: "/docs/agreement.pdf",
          monthlyStatement: "/docs/statement.csv",
          projectDocuments: "/docs/project-docs.pdf",
        }} />

        <Button 
          variant="outline" 
          className="w-full"
          onClick={() => setCustomerData(null)}
        >
          View Different Account
        </Button>
      </main>

      <BottomNav />
    </div>
  );
};

export default Index;
