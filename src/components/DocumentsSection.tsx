import { Card } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentsSectionProps {
  documents: {
    agreementOfSale: string;
    monthlyStatement: string;
    projectDocuments: string;
  };
}

const DocumentsSection = ({ documents }: DocumentsSectionProps) => {
  return (
    <Card className="p-5 shadow-sm">
      <h3 className="text-lg font-bold text-foreground mb-4">Documents</h3>
      
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-auto py-3 px-3 flex items-start gap-2">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
            <FileText className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold">Agreement of Sale</p>
            <p className="text-xs text-muted-foreground">PDF Excel CSV</p>
          </div>
        </Button>

        <Button variant="outline" className="h-auto py-3 px-3 flex items-start gap-2">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
            <FileText className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold">Monthly Statement</p>
            <p className="text-xs text-muted-foreground">Excel CSV</p>
          </div>
        </Button>

        <Button variant="outline" className="h-auto py-3 px-3 flex items-start gap-2 col-span-2">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
            <FileText className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold">Project Documents</p>
          </div>
        </Button>
      </div>
    </Card>
  );
};

export default DocumentsSection;
