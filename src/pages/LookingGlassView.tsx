import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLookingGlass } from "@/contexts/LookingGlassContext";
import LookingGlassBanner from "@/components/LookingGlassBanner";
import CustomerHeader from "@/components/CustomerHeader";
import CustomerOverview from "@/components/CustomerOverview";
import PricingTiles from "@/components/PricingTiles";
import InfoCards from "@/components/InfoCards";
import PaymentSummary from "@/components/PaymentSummary";
import DocumentsSection from "@/components/DocumentsSection";
import PaymentHistory from "@/components/PaymentHistory";
import TwoFABypassDialog from "@/components/TwoFABypassDialog";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, Lock, Eye, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LookingGlassView = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const { isLookingGlassMode, customer, exitLookingGlass } = useLookingGlass();
  const [standData, setStandData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  const fetchCustomerData = useCallback(async () => {
    if (!customer || !tenantId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-customer-data', {
        body: { 
          lookingGlassMode: true,
          targetStandNumber: customer.standNumber,
          tenant_id: tenantId,
        }
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      const targetStand = data.stands?.find(
        (s: any) => s.standNumber?.toUpperCase() === customer.standNumber?.toUpperCase(),
      );

      if (targetStand) {
        setStandData(targetStand);
      } else {
        toast.error("Could not load customer data");
      }
    } catch (error: any) {
      console.error("Failed to fetch customer data:", error);
      toast.error("Failed to load customer data");
    } finally {
      setLoading(false);
    }
  }, [customer, tenantId]);

  useEffect(() => {
    if (!isLookingGlassMode || !customer) {
      navigate("/internal-portal");
      return;
    }

    if (!tenantId) return;
    fetchCustomerData();
  }, [isLookingGlassMode, customer, navigate, tenantId, fetchCustomerData]);

  if (!isLookingGlassMode || !customer) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <LookingGlassBanner />
        <div className="pt-16 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading customer view...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!standData) {
    return (
      <div className="min-h-screen bg-background">
        <LookingGlassBanner />
        <div className="pt-16 flex items-center justify-center min-h-screen px-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
              <h3 className="text-lg font-semibold">Unable to Load Customer Data</h3>
              <p className="text-muted-foreground">
                Could not find data for Stand {customer.standNumber}
              </p>
              <Button onClick={exitLookingGlass}>Return to Admin Portal</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <LookingGlassBanner />
      
      {/* Add top padding to account for the banner */}
      <div className="pt-14">
        {/* Read-only indicator overlay for the header */}
        <div className="relative">
          <CustomerHeader />
          <div className="absolute top-2 right-2 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs px-2 py-1 rounded-full flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Read-Only
          </div>
        </div>

        <main className="max-w-md mx-auto px-4 py-4 space-y-4 pb-8">
          {/* Customer Context Card */}
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <Eye className="h-4 w-4" />
                Viewing Customer Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                You are viewing this account exactly as <strong>{customer.customerName}</strong> sees it.
              </p>
              
              {/* Support Context: Stand Number & Customer Category */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-amber-200 dark:border-amber-700">
                <div>
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Stand Number</p>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{customer.standNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Customer Category</p>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{standData?.customerCategory || '—'}</p>
                </div>
              </div>
              
              <p className="text-xs text-amber-600 dark:text-amber-400">All interactions are disabled in this mode.</p>
              
              {/* 2FA Bypass Button - Only show if customer has phone number */}
              {standData?.phoneNumber && (
                <div className="pt-2 border-t border-amber-200 dark:border-amber-700">
                  <TwoFABypassDialog
                    phoneNumber={standData.phoneNumber}
                    standNumber={customer.standNumber}
                    customerName={customer.customerName}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tab Navigation */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-4 mt-4">
              {/* Customer Overview - Disabled state */}
              <div className="pointer-events-none opacity-90">
                <CustomerOverview
                  customerId={standData.customerId}
                  customerName={standData.customerName}
                  standNumber={standData.standNumber}
                  allStands={[standData]}
                  onStandChange={() => {}}
                />
              </div>

              {/* Pricing Tiles - Disabled state */}
              <div className="pointer-events-none">
                <PricingTiles
                  totalPrice={standData.totalPrice}
                  deposit={standData.deposit}
                  isVatInclusive={standData.vatInclusive}
                />
              </div>

              {/* Info Cards - Disabled state */}
              <div className="pointer-events-none">
                <InfoCards 
                  standNumber={standData.standNumber}
                  standBalance={standData.standBalance}
                  lastPayment={standData.lastPayment}
                  lastPaymentDate={standData.lastPaymentDate}
                  nextPayment={standData.nextPayment}
                  nextPaymentDate={standData.nextPaymentDate}
                  isOverdue={standData.isOverdue}
                  daysOverdue={standData.daysOverdue}
                  totalPaid={standData.totalPaid}
                  progressPercentage={standData.progressPercentage}
                  allStands={[standData]}
                  onStandChange={() => {}}
                  paymentNotYetDue={standData.paymentNotYetDue}
                />
              </div>

              {/* Payment Summary - Disabled state */}
              <div className="pointer-events-none">
                <PaymentSummary
                  signedBySeller={standData.agreementSignedByWarwickshire || false}
                  signedByBuyer={standData.agreementSignedByClient || false}
                />
              </div>
            </TabsContent>

            <TabsContent value="payments" className="space-y-4 mt-4">
              {/* Payment History - Disabled state */}
              <div className="pointer-events-none">
                <PaymentHistory payments={standData.paymentHistory || []} />
              </div>
            </TabsContent>

            <TabsContent value="documents" className="space-y-4 mt-4">
              {/* Documents Section - Disabled state */}
              <div className="pointer-events-none">
                <DocumentsSection documents={{
                  agreementOfSale: "/docs/agreement.pdf",
                  monthlyStatement: "/docs/statement.csv",
                  projectDocuments: "/docs/project-docs.pdf",
                }} />
              </div>
              
              {/* Read-only notice for documents */}
              <Card className="border-muted">
                <CardContent className="pt-4 text-center text-sm text-muted-foreground">
                  <Lock className="h-5 w-5 mx-auto mb-2 opacity-50" />
                  <p>Document downloads are disabled in Looking Glass mode.</p>
                  <p className="text-xs mt-1">This view is for observation only.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Bottom exit button for mobile */}
          <div className="pt-4">
            <Button 
              variant="outline" 
              className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={exitLookingGlass}
            >
              <Eye className="h-4 w-4 mr-2" />
              Exit Looking Glass Mode
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LookingGlassView;
