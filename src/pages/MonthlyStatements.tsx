import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ArrowLeft, Printer } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import lakecityLogo from "@/assets/lakecity-logo.svg";

const MonthlyStatements = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [statementData, setStatementData] = useState<any>(null);

  useEffect(() => {
    fetchStatementData();
  }, []);

  const fetchStatementData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      const { data, error } = await supabase.functions.invoke("fetch-google-sheets", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      if (data && data.stands && data.stands.length > 0) {
        // Get the first stand for now
        const stand = data.stands[0];
        
        // Statement date
        const statementDate = new Date(2025, 10, 1); // November 1, 2025
        
        // Get all payment history
        const allPayments = stand.paymentHistory || [];

        // Calculate next payment due
        const nextPaymentDate = new Date(2025, 11, 5); // December 5, 2025
        const daysPastDue = statementDate > nextPaymentDate ? 
          Math.floor((statementDate.getTime() - nextPaymentDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

        setStatementData({
          statementDate: "November 1, 2025",
          statementPeriod: "All Time",
          customerName: stand.customerName || "[Customer Full Name]",
          standNumber: stand.standNumber,
          totalPrice: "$100,000.00", // Placeholder - add to sheet data
          totalPaid: stand.totalPaid,
          currentBalance: stand.currentBalance,
          paymentProgress: stand.progressPercentage,
          nextPaymentDue: "December 5, 2025",
          nextPaymentAmount: stand.monthlyPayment || "$1,167.00",
          daysPastDue: daysPastDue,
          payments: allPayments.map((p: any) => ({
            date: p.date,
            amount: p.amount,
            principal: p.principal,
            interest: p.interest,
            vat: p.vat
          }))
        });
      }

      setLoading(false);
    } catch (error: any) {
      console.error("Error fetching statement data:", error);
      toast({
        title: "Error",
        description: "Failed to load statement data",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20 flex items-center justify-center">
        <p className="text-muted-foreground">Loading statement...</p>
      </div>
    );
  }

  if (!statementData) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <CustomerHeader />
        <main className="max-w-4xl mx-auto px-3 py-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-3 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Card className="p-8">
            <p className="text-center text-muted-foreground">No statement data available</p>
          </Card>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <CustomerHeader />
      
      <main className="max-w-4xl mx-auto px-3 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="mb-3 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

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
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">Statement Date</p>
                <p className="text-base md:text-lg font-bold text-foreground">{statementData.statementDate}</p>
              </div>
              <p className="text-xs text-muted-foreground">Period: {statementData.statementPeriod}</p>
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
                <p className="text-xs text-muted-foreground mb-1">Customer Name</p>
                <p className="text-base md:text-lg font-bold text-foreground break-words">{statementData.customerName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Stand Number</p>
                <p className="text-base md:text-lg font-bold text-foreground">{statementData.standNumber}</p>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Account Summary - Enhanced Design */}
          <div className="mb-6 md:mb-8">
            <h3 className="text-xs md:text-sm font-semibold text-primary uppercase tracking-wide mb-3 md:mb-4">Account Summary</h3>
            <div className="grid grid-cols-2 gap-2.5 md:gap-4">
              <div className="bg-gradient-to-br from-muted/50 to-muted/30 p-3 md:p-5 rounded-xl border border-border">
                <p className="text-xs text-muted-foreground mb-1 md:mb-2 uppercase tracking-wide">Purchase Price</p>
                <p className="text-base md:text-2xl font-bold text-foreground">{statementData.totalPrice}</p>
              </div>
              <div className="bg-gradient-to-br from-primary/20 to-primary/10 p-3 md:p-5 rounded-xl border border-primary/30">
                <p className="text-xs text-muted-foreground mb-1 md:mb-2 uppercase tracking-wide">Total Paid</p>
                <p className="text-base md:text-2xl font-bold text-primary">{statementData.totalPaid}</p>
              </div>
              <div className="bg-gradient-to-br from-muted/50 to-muted/30 p-3 md:p-5 rounded-xl border border-border">
                <p className="text-xs text-muted-foreground mb-1 md:mb-2 uppercase tracking-wide">Balance Due</p>
                <p className="text-base md:text-2xl font-bold text-foreground">{statementData.currentBalance}</p>
              </div>
              <div className="bg-gradient-to-br from-accent/20 to-accent/10 p-3 md:p-5 rounded-xl border border-accent/30">
                <p className="text-xs text-muted-foreground mb-1 md:mb-2 uppercase tracking-wide">Progress</p>
                <p className="text-base md:text-2xl font-bold text-foreground">{statementData.paymentProgress}%</p>
              </div>
            </div>
          </div>

          {/* Next Payment Due - Enhanced */}
          <div className={`mb-6 md:mb-8 p-4 md:p-6 rounded-xl border-2 ${statementData.daysPastDue > 0 ? 'bg-destructive/10 border-destructive' : 'bg-accent/10 border-accent'}`}>
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 md:gap-0">
              <div>
                <p className="text-xs md:text-sm font-semibold text-muted-foreground mb-1 md:mb-2 uppercase tracking-wide">Next Payment Due</p>
                <p className={`text-lg md:text-2xl font-bold ${statementData.daysPastDue > 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {statementData.nextPaymentDue}
                </p>
                {statementData.daysPastDue > 0 && (
                  <p className="text-xs md:text-sm text-destructive font-semibold mt-1 md:mt-2 flex items-center gap-1">
                    ⚠️ {statementData.daysPastDue} days past due
                  </p>
                )}
              </div>
              <div className="text-left md:text-right">
                <p className="text-xs md:text-sm text-muted-foreground mb-1 md:mb-2 uppercase tracking-wide">Amount Due</p>
                <p className="text-2xl md:text-3xl font-bold text-foreground">{statementData.nextPaymentAmount}</p>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Payment History Table */}
          <div className="mb-6 md:mb-8">
            <h3 className="text-xs md:text-sm font-semibold text-primary uppercase tracking-wide mb-3 md:mb-4">
              Payment History - {statementData.statementPeriod}
            </h3>
            <div className="overflow-x-auto rounded-lg border border-border -mx-4 md:mx-0">
              <table className="w-full text-xs md:text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b border-border">
                    <th className="text-left py-2.5 md:py-4 px-2 md:px-4 font-semibold text-foreground whitespace-nowrap">Date</th>
                    <th className="text-right py-2.5 md:py-4 px-2 md:px-4 font-semibold text-foreground whitespace-nowrap">Principal</th>
                    <th className="text-right py-2.5 md:py-4 px-2 md:px-4 font-semibold text-foreground whitespace-nowrap hidden md:table-cell">Interest</th>
                    <th className="text-right py-2.5 md:py-4 px-2 md:px-4 font-semibold text-foreground whitespace-nowrap hidden md:table-cell">VAT</th>
                    <th className="text-right py-2.5 md:py-4 px-2 md:px-4 font-semibold text-primary whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody className="bg-card">
                  {statementData.payments.length > 0 ? (
                    statementData.payments.map((payment: any, index: number) => (
                      <tr key={index} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 md:py-4 px-2 md:px-4 text-muted-foreground whitespace-nowrap">{payment.date}</td>
                        <td className="py-2.5 md:py-4 px-2 md:px-4 text-right text-foreground whitespace-nowrap">{payment.principal}</td>
                        <td className="py-2.5 md:py-4 px-2 md:px-4 text-right text-foreground whitespace-nowrap hidden md:table-cell">{payment.interest}</td>
                        <td className="py-2.5 md:py-4 px-2 md:px-4 text-right text-foreground whitespace-nowrap hidden md:table-cell">{payment.vat}</td>
                        <td className="py-2.5 md:py-4 px-2 md:px-4 text-right font-semibold text-primary whitespace-nowrap">{payment.amount}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 md:py-8 text-center text-muted-foreground text-xs md:text-sm">
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
          <div className="flex flex-col md:flex-row gap-2 md:gap-3 pt-4 md:pt-6 border-t border-border">
            <Button className="flex-1" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              <span className="text-sm md:text-base">Print Statement</span>
            </Button>
            <Button variant="outline" className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              <span className="text-sm md:text-base">Download PDF</span>
            </Button>
          </div>
        </Card>
      </main>

      <BottomNav />
    </div>
  );
};

export default MonthlyStatements;
