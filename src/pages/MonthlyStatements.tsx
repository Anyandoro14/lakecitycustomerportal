import { useNavigate } from "react-router-dom";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, ArrowLeft } from "lucide-react";

const MonthlyStatements = () => {
  const navigate = useNavigate();

  // Mock data - replace with actual data from backend
  const statements = [
    { id: 1, month: "December 2024", date: "Dec 5, 2024", url: "/docs/statement-dec-2024.pdf" },
    { id: 2, month: "November 2024", date: "Nov 5, 2024", url: "/docs/statement-nov-2024.pdf" },
    { id: 3, month: "October 2024", date: "Oct 5, 2024", url: "/docs/statement-oct-2024.pdf" },
    { id: 4, month: "September 2024", date: "Sep 5, 2024", url: "/docs/statement-sep-2024.pdf" },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <CustomerHeader />
      
      <main className="max-w-md mx-auto px-3 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="mb-3 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        <h1 className="text-2xl font-bold text-foreground mb-4">Monthly Statements</h1>

        <div className="space-y-2.5">
          {statements.map((statement) => (
            <Card key={statement.id} className="p-3.5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{statement.month}</p>
                    <p className="text-xs text-muted-foreground">{statement.date}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <Download className="h-4 w-4" />
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

export default MonthlyStatements;
