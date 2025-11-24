import { useNavigate } from "react-router-dom";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, ArrowLeft, Printer } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const MonthlyStatements = () => {
  const navigate = useNavigate();

  // Mock data - replace with actual data from backend
  const currentStatement = {
    statementDate: "January 1, 2026",
    statementPeriod: "December 2025",
    customerName: "[Customer Full Name]",
    standNumber: "55555",
    totalPrice: "$100,000.00",
    totalPaid: "$60,167.00",
    currentBalance: "$39,833.00",
    paymentProgress: 60,
    nextPaymentDue: "June 5, 2026",
    nextPaymentAmount: "$1,167.00",
    daysPastDue: 0,
    payments: [
      { date: "05/05/2026", amount: "$12,000.00", principal: "$11,400.00", interest: "$0.00", vat: "$600.00" },
      { date: "04/05/2026", amount: "$11,000.00", principal: "$10,450.00", interest: "$0.00", vat: "$550.00" },
      { date: "03/05/2026", amount: "$10,000.00", principal: "$9,500.00", interest: "$0.00", vat: "$500.00" },
      { date: "02/05/2026", amount: "$9,000.00", principal: "$8,550.00", interest: "$0.00", vat: "$450.00" },
      { date: "01/05/2026", amount: "$8,000.00", principal: "$7,600.00", interest: "$0.00", vat: "$400.00" },
      { date: "12/05/2025", amount: "$7,000.00", principal: "$6,650.00", interest: "$0.00", vat: "$350.00" },
      { date: "11/05/2025", amount: "$2,000.00", principal: "$1,900.00", interest: "$0.00", vat: "$100.00" },
    ]
  };

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
        <Card className="p-8 shadow-lg bg-card">
          {/* Header Section */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">MONTHLY STATEMENT</h1>
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-semibold">Lakecity Development Ltd.</p>
                <p>[Lakecity Address Line 1]</p>
                <p>[Lakecity Address Line 2]</p>
              </div>
            </div>
            <div className="text-right text-sm space-y-1">
              <p className="font-semibold text-foreground">Statement Date</p>
              <p className="text-muted-foreground">{currentStatement.statementDate}</p>
              <p className="font-semibold text-foreground mt-3">Period</p>
              <p className="text-muted-foreground">{currentStatement.statementPeriod}</p>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Customer Information */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-3">Account Information</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Customer Name</p>
                <p className="font-semibold text-foreground">{currentStatement.customerName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Stand Number</p>
                <p className="font-semibold text-foreground">{currentStatement.standNumber}</p>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Account Summary */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">Account Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Total Purchase Price</p>
                <p className="text-xl font-bold text-foreground">{currentStatement.totalPrice}</p>
              </div>
              <div className="bg-primary/10 p-4 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Total Paid</p>
                <p className="text-xl font-bold text-primary">{currentStatement.totalPaid}</p>
              </div>
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Current Balance</p>
                <p className="text-xl font-bold text-foreground">{currentStatement.currentBalance}</p>
              </div>
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Payment Progress</p>
                <p className="text-xl font-bold text-foreground">{currentStatement.paymentProgress}%</p>
              </div>
            </div>
          </div>

          {/* Next Payment Due */}
          <div className="mb-8 bg-accent/20 p-4 rounded-lg border border-accent">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Next Payment Due</p>
                <p className={`text-lg font-bold ${currentStatement.daysPastDue > 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {currentStatement.nextPaymentDue}
                </p>
                {currentStatement.daysPastDue > 0 && (
                  <p className="text-sm text-destructive font-semibold mt-1">
                    {currentStatement.daysPastDue} days past due
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-1">Amount Due</p>
                <p className="text-2xl font-bold text-foreground">{currentStatement.nextPaymentAmount}</p>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Payment History Table */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">Payment History - {currentStatement.statementPeriod}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 font-semibold text-foreground">Date</th>
                    <th className="text-right py-3 px-2 font-semibold text-foreground">Principal</th>
                    <th className="text-right py-3 px-2 font-semibold text-foreground">Interest</th>
                    <th className="text-right py-3 px-2 font-semibold text-foreground">VAT</th>
                    <th className="text-right py-3 px-2 font-semibold text-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {currentStatement.payments.map((payment, index) => (
                    <tr key={index} className="border-b border-border/50">
                      <td className="py-3 px-2 text-muted-foreground">{payment.date}</td>
                      <td className="py-3 px-2 text-right text-foreground">{payment.principal}</td>
                      <td className="py-3 px-2 text-right text-foreground">{payment.interest}</td>
                      <td className="py-3 px-2 text-right text-foreground">{payment.vat}</td>
                      <td className="py-3 px-2 text-right font-semibold text-foreground">{payment.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Footer Contact Information */}
          <div className="text-sm text-muted-foreground">
            <p className="font-semibold text-foreground mb-2">Questions about your statement?</p>
            <div className="space-y-1">
              <p>[Warwickshire Address Line 1]</p>
              <p>[Warwickshire Address Line 2]</p>
              <p>Email: [Warwickshire Email Address]</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-8 pt-6 border-t border-border">
            <Button className="flex-1" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Print Statement
            </Button>
            <Button variant="outline" className="flex-1">
              <Download className="h-4 w-4 mr-2" />
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
