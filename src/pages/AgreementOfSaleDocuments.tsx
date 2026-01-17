import { useNavigate } from "react-router-dom";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, ArrowLeft, CheckCircle2, Circle } from "lucide-react";

const AgreementOfSaleDocuments = () => {
  const navigate = useNavigate();

  // Mock data - replace with actual data from backend
  const signedBySeller = true;
  const signedByBuyer = false;
  
  const documents = [
    { id: 1, name: "Agreement of Sale - Original", date: "Jan 15, 2024", url: "/docs/agreement-original.pdf", available: true },
    { id: 2, name: "Agreement of Sale - Signed by Seller", date: "Jan 20, 2024", url: "/docs/agreement-seller-signed.pdf", available: signedBySeller },
    { id: 3, name: "Agreement of Sale - Fully Executed", date: "Pending", url: "/docs/agreement-final.pdf", available: signedByBuyer && signedBySeller },
  ];

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
          <h3 className="text-sm font-semibold text-foreground mb-3">Status</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              {signedBySeller ? (
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
              <span className={signedBySeller ? "text-foreground" : "text-muted-foreground"}>
                Signed by Seller
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {signedByBuyer ? (
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
              <span className={signedByBuyer ? "text-foreground" : "text-muted-foreground"}>
                Signed by Buyer
              </span>
            </div>
          </div>
        </Card>

        <h2 className="text-lg font-semibold text-foreground mb-3">Documents</h2>

        <div className="space-y-3">
          {documents.map((doc) => (
            <Card 
              key={doc.id} 
              className={`p-4 shadow-sm transition-all ${
                doc.available ? "active:scale-[0.98]" : "opacity-50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-11 h-11 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{doc.date}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-10 w-10 flex-shrink-0" disabled={!doc.available}>
                  <Download className="h-5 w-5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default AgreementOfSaleDocuments;
