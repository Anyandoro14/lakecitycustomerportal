import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ArrowLeft, Printer, Calendar, ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import lakecityLogo from "@/assets/lakecity-logo.svg";
import { format, parseISO } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MonthlyStatement {
  id: string;
  statement_month: string;
  opening_balance: number;
  payments_received: unknown;
  total_payments: number;
  closing_balance: number;
  is_overdue: boolean;
  days_overdue: number;
  stand_number: string;
  customer_email: string;
}

const MonthlyStatements = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [statements, setStatements] = useState<MonthlyStatement[]>([]);
  const [selectedStatement, setSelectedStatement] = useState<MonthlyStatement | null>(null);
  const [customerName, setCustomerName] = useState<string>("");
  const [showHistory, setShowHistory] = useState(true);

  useEffect(() => {
    refreshAndFetchStatements();
  }, []);

  // Refresh statements from sheet data, then fetch from database
  const refreshAndFetchStatements = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      // Get user's stand number from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, stand_number")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profile?.full_name) {
        setCustomerName(profile.full_name);
      }

      // If we have a stand number, refresh statements from the latest sheet data
      if (profile?.stand_number) {
        console.log("Refreshing statements for stand:", profile.stand_number);
        await supabase.functions.invoke("generate-monthly-statements", {
          body: {
            target_stand: profile.stand_number,
            refresh: true, // This triggers update of existing statements
          },
        });
      }

      // Fetch all statements for this user from the database
      const { data, error } = await supabase
        .from("monthly_statements")
        .select("*")
        .order("statement_month", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setStatements(data);
        // Auto-select the most recent statement
        setSelectedStatement(data[0]);
        setShowHistory(false);
      }

      setLoading(false);
    } catch (error: any) {
      console.error("Error fetching statements:", error);
      toast({
        title: "Error",
        description: "Failed to load statements",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatMonthYear = (dateString: string) => {
    const date = parseISO(dateString);
    return format(date, "MMMM yyyy");
  };

  const formatShortMonth = (dateString: string) => {
    const date = parseISO(dateString);
    return format(date, "MMM yyyy");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-24 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading statements...</p>
        </div>
      </div>
    );
  }

  if (statements.length === 0) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <CustomerHeader />
        <main className="max-w-4xl mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-4 -ml-2 h-10">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Card className="p-8">
            <div className="text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No statements available yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Your monthly statements will appear here once generated.
              </p>
            </div>
          </Card>
        </main>
        <BottomNav />
      </div>
    );
  }

  // Statement History View
  if (showHistory) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <CustomerHeader />
        
        <main className="max-w-4xl mx-auto px-4 py-4">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-4 -ml-2 h-10"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="mb-4">
            <h1 className="text-xl font-bold text-foreground">Monthly Statements</h1>
            <p className="text-sm text-muted-foreground">View and download your account statements</p>
          </div>

          <Card className="overflow-hidden">
            <div className="bg-primary/5 px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Statement History</span>
              </div>
            </div>
            
            <ScrollArea className="max-h-[60vh]">
              <div className="divide-y divide-border">
                {statements.map((statement) => (
                    <button
                      key={statement.id}
                      onClick={() => {
                        setSelectedStatement(statement);
                        setShowHistory(false);
                      }}
                      className="w-full px-4 py-4 flex items-center justify-between hover:bg-muted/50 active:bg-muted transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">
                          {formatMonthYear(statement.statement_month)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Stand {statement.stand_number}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {formatCurrency(statement.closing_balance)}
                        </p>
                        <p className="text-xs text-muted-foreground">Balance</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </main>

        <BottomNav />
      </div>
    );
  }

  // Single Statement View
  if (!selectedStatement) {
    return null;
  }

  const payments = Array.isArray(selectedStatement.payments_received) 
    ? selectedStatement.payments_received 
    : [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <CustomerHeader />
      
      <main className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4 gap-2">
          <Button
            variant="ghost"
            onClick={() => setShowHistory(true)}
            className="-ml-2 h-10"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            All Statements
          </Button>
          
          {/* Quick month navigator */}
          <div className="flex items-center gap-1">
            {statements.slice(0, 3).map((stmt) => (
              <Button
                key={stmt.id}
                variant={stmt.id === selectedStatement.id ? "default" : "outline"}
                size="sm"
                className="text-xs px-2 h-7"
                onClick={() => setSelectedStatement(stmt)}
              >
                {formatShortMonth(stmt.statement_month)}
              </Button>
            ))}
            {statements.length > 3 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs px-2 h-7"
                onClick={() => setShowHistory(true)}
              >
                More
              </Button>
            )}
          </div>
        </div>

        {/* Statement Document */}
        <Card className="p-4 md:p-8 shadow-lg bg-card">
          {/* Header with Logos */}
          <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4 md:mb-6 pb-4 md:pb-6 border-b-2 border-primary/20">
            <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
              <img src={lakecityLogo} alt="LakeCity" className="h-8 md:h-10 w-auto" />
              <h1 className="text-lg md:text-2xl font-bold text-primary">LakeCity</h1>
            </div>
            <div className="text-left md:text-right w-full md:w-auto">
              <div className="bg-primary/10 px-3 md:px-4 py-1.5 md:py-2 rounded-lg mb-1 md:mb-2 inline-block">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">Statement Period</p>
                <p className="text-base md:text-lg font-bold text-foreground">
                  {formatMonthYear(selectedStatement.statement_month)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Stand: {selectedStatement.stand_number}</p>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-4 md:mb-6">
            <h2 className="text-xl md:text-3xl font-bold text-foreground tracking-tight">MONTHLY STATEMENT</h2>
            <div className="w-16 md:w-24 h-1 bg-primary mx-auto mt-1 md:mt-2"></div>
          </div>

          <Separator className="my-6" />

          {/* Customer Information */}
          <div className="mb-6 md:mb-8 bg-muted/30 p-4 md:p-6 rounded-lg">
            <h3 className="text-xs md:text-sm font-semibold text-primary uppercase tracking-wide mb-3 md:mb-4">Account Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Customer</p>
                <p className="text-base md:text-lg font-bold text-foreground break-words">
                  {customerName || selectedStatement.customer_email}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Stand Number</p>
                <p className="text-base md:text-lg font-bold text-foreground">{selectedStatement.stand_number}</p>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Account Summary */}
          <div className="mb-6 md:mb-8">
            <h3 className="text-xs md:text-sm font-semibold text-primary uppercase tracking-wide mb-3 md:mb-4">Account Summary</h3>
            <div className="grid grid-cols-2 gap-2.5 md:gap-4">
              <div className="bg-gradient-to-br from-muted/50 to-muted/30 p-3 md:p-5 rounded-xl border border-border">
                <p className="text-xs text-muted-foreground mb-1 md:mb-2 uppercase tracking-wide">Opening Balance</p>
                <p className="text-base md:text-2xl font-bold text-foreground">
                  {formatCurrency(selectedStatement.opening_balance)}
                </p>
              </div>
              <div className="bg-gradient-to-br from-primary/20 to-primary/10 p-3 md:p-5 rounded-xl border border-primary/30">
                <p className="text-xs text-muted-foreground mb-1 md:mb-2 uppercase tracking-wide">Payments Received</p>
                <p className="text-base md:text-2xl font-bold text-primary">
                  {formatCurrency(selectedStatement.total_payments)}
                </p>
              </div>
              <div className={`col-span-2 p-3 md:p-5 rounded-xl border ${
                selectedStatement.is_overdue 
                  ? 'bg-gradient-to-br from-destructive/20 to-destructive/10 border-destructive/30' 
                  : 'bg-gradient-to-br from-accent/20 to-accent/10 border-accent/30'
              }`}>
                <p className="text-xs text-muted-foreground mb-1 md:mb-2 uppercase tracking-wide">Closing Balance</p>
                <p className={`text-xl md:text-3xl font-bold ${
                  selectedStatement.is_overdue ? 'text-destructive' : 'text-foreground'
                }`}>
                  {formatCurrency(selectedStatement.closing_balance)}
                </p>
                {selectedStatement.is_overdue && selectedStatement.days_overdue > 0 && (
                  <p className="text-xs md:text-sm text-destructive font-semibold mt-1 md:mt-2 flex items-center gap-1">
                    ⚠️ {selectedStatement.days_overdue} days overdue
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Payment History Table */}
          <div className="mb-6 md:mb-8">
            <h3 className="text-xs md:text-sm font-semibold text-primary uppercase tracking-wide mb-3 md:mb-4">
              Payments Received This Month
            </h3>
            <div className="overflow-x-auto rounded-lg border border-border -mx-4 md:mx-0">
              <table className="w-full text-xs md:text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b border-border">
                    <th className="text-left py-2.5 md:py-4 px-2 md:px-4 font-semibold text-foreground whitespace-nowrap">Date</th>
                    <th className="text-right py-2.5 md:py-4 px-2 md:px-4 font-semibold text-foreground whitespace-nowrap">Amount</th>
                  </tr>
                </thead>
                <tbody className="bg-card">
                  {payments.length > 0 ? (
                    payments.map((payment: any, index: number) => (
                      <tr key={index} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 md:py-4 px-2 md:px-4 text-muted-foreground whitespace-nowrap">
                          {payment.date || "N/A"}
                        </td>
                        <td className="py-2.5 md:py-4 px-2 md:px-4 text-right font-semibold text-primary whitespace-nowrap">
                          {payment.amount || formatCurrency(payment.value || 0)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="py-6 md:py-8 text-center text-muted-foreground text-xs md:text-sm">
                        No payments recorded for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Footer Contact Information */}
          <div className="bg-muted/20 p-4 md:p-6 rounded-lg mb-4 md:mb-6">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-primary font-bold text-lg md:text-xl">?</span>
                </div>
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm md:text-base mb-1 md:mb-2">Questions about your statement?</p>
                <p className="text-xs md:text-sm text-muted-foreground">Contact Warwickshire Accounts Receivable</p>
                <p className="text-xs md:text-sm text-primary font-medium mt-1 break-all">accounts@lakecity.co.zw</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 md:pt-6 border-t border-border">
            <Button className="flex-1 h-12 text-base" onClick={() => window.print()}>
              <Printer className="h-5 w-5 mr-2" />
              Print Statement
            </Button>
            <Button variant="outline" className="flex-1 h-12 text-base">
              <Download className="h-5 w-5 mr-2" />
              Download PDF
            </Button>
          </div>
        </Card>
      </main>

      <BottomNav />
    </div>
  );
};

export default MonthlyStatements;
