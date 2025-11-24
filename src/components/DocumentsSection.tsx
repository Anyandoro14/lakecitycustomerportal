import { Card } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface DocumentsSectionProps {
  documents: {
    agreementOfSale: string;
    monthlyStatement: string;
    projectDocuments: string;
  };
}

const DocumentsSection = ({ documents }: DocumentsSectionProps) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold text-foreground">Documents</h3>
      
      <div className="grid grid-cols-2 gap-2.5">
        <Card 
          className="p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/agreement-of-sale")}
        >
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold">Agreement of Sale</p>
              <p className="text-[10px] text-muted-foreground">PDF Excel CSV</p>
            </div>
          </div>
        </Card>

        <Card 
          className="p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/monthly-statements")}
        >
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold">Monthly Statement</p>
              <p className="text-[10px] text-muted-foreground">Excel CSV</p>
            </div>
          </div>
        </Card>

        <Card className="p-3 shadow-sm col-span-2">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold">Project Documents</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DocumentsSection;
