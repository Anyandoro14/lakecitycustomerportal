import { Card } from "@/components/ui/card";
import { Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentsSectionProps {
  documents: {
    agreementOfSale: string;
    monthlyStatement: string;
    paymentSchedule: string;
  };
}

const DocumentsSection = ({ documents }: DocumentsSectionProps) => {
  return (
    <Card className="p-5 shadow-sm">
      <h3 className="text-lg font-bold text-foreground mb-4">Documents</h3>
      
      <div className="flex justify-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-softGreen flex items-center justify-center shadow-sm">
          <Check className="h-6 w-6 text-softGreen-foreground" />
        </div>
        <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-sm">
          <Check className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="w-16 h-16 rounded-full bg-softGreen flex items-center justify-center shadow-sm">
          <Check className="h-6 w-6 text-softGreen-foreground" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold text-foreground mb-2">Monk Estate Santa Creal</div>
        
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-auto py-3 px-3 flex flex-col items-start gap-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <FileText className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold">Agreement of Sale</p>
                <p className="text-xs text-muted-foreground">PDF Excel CSV</p>
              </div>
            </div>
          </Button>

          <Button variant="outline" className="h-auto py-3 px-3 flex flex-col items-start gap-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <FileText className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold">Monthly Statement</p>
                <p className="text-xs text-muted-foreground">Excel CSV</p>
              </div>
            </div>
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default DocumentsSection;
