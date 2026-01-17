import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, ArrowLeft, CheckCircle2, Circle, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const AgreementOfSaleDocuments = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [standData, setStandData] = useState<any>(null);

  useEffect(() => {
    fetchStandData();
  }, []);

  const fetchStandData = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-google-sheets', {
        body: {}
      });

      if (error) throw error;

      if (data?.stands?.length > 0) {
        setStandData(data.stands[0]);
      }
    } catch (error) {
      console.error('Failed to fetch stand data:', error);
      toast.error("Failed to load document data");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadAgreement = () => {
    if (standData?.agreementOfSaleFile) {
      // Open the secure Google Drive link in a new tab
      window.open(standData.agreementOfSaleFile, '_blank', 'noopener,noreferrer');
    } else {
      toast.error("Agreement document not available yet");
    }
  };

  const signedBySeller = standData?.agreementSignedByWarwickshire || false;
  const signedByBuyer = standData?.agreementSignedByClient || false;
  const hasAgreementFile = !!standData?.agreementOfSaleFile;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <CustomerHeader />
      
      <main className="max-w-md mx-auto px-4 py-4">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mb-3 -ml-2 h-10"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold text-foreground mb-3">Agreement of Sale</h1>
        
        <Card className="p-4 shadow-sm mb-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Signature Status</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              {signedBySeller ? (
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
              <span className={signedBySeller ? "text-foreground" : "text-muted-foreground"}>
                Signed by LakeCity/Warwickshire
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {signedByBuyer ? (
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
              <span className={signedByBuyer ? "text-foreground" : "text-muted-foreground"}>
                Signed by You
              </span>
            </div>
          </div>
        </Card>

        <h2 className="text-lg font-semibold text-foreground mb-3">Your Document</h2>

        <Card className={`p-4 shadow-sm ${hasAgreementFile ? "active:scale-[0.98]" : "opacity-60"}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-11 h-11 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  Agreement of Sale - Stand {standData?.standNumber}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasAgreementFile ? "Available for download" : "Not yet available"}
                </p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-10 w-10 flex-shrink-0" 
              disabled={!hasAgreementFile}
              onClick={handleDownloadAgreement}
            >
              {hasAgreementFile ? (
                <ExternalLink className="h-5 w-5" />
              ) : (
                <Download className="h-5 w-5" />
              )}
            </Button>
          </div>
        </Card>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Your agreement document is securely stored and accessible only to you.
        </p>
      </main>

      <BottomNav />
    </div>
  );
};

export default AgreementOfSaleDocuments;
