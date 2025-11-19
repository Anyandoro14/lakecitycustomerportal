import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { useState } from "react";

interface PaymentHistoryItem {
  date: string;
  amount: string;
  principal: string;
  interest: string;
  vat: string;
  total: string;
}

interface PaymentHistoryProps {
  payments: PaymentHistoryItem[];
}

const PaymentHistory = ({ payments }: PaymentHistoryProps) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  // Sort payments by date (most recent first)
  const sortedPayments = [...payments].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <Card className="p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
          <History className="h-5 w-5 text-accent" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">PAYMENT HISTORY</h2>
      </div>

      <div className="space-y-2">
        {sortedPayments.map((payment, index) => (
          <div
            key={index}
            className="border border-border rounded-lg overflow-hidden"
          >
            <button
              onClick={() => toggleExpand(index)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
            >
              <div className="text-left">
                <div className="text-sm text-muted-foreground">
                  {new Date(payment.date).toLocaleDateString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric'
                  })}
                </div>
                <div className="text-xs text-muted-foreground">Payment</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-medium text-foreground">
                    {payment.amount}
                  </div>
                </div>
                {expandedIndex === index ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </button>

            {expandedIndex === index && (
              <div className="px-4 py-3 bg-muted/30 border-t border-border space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Payment to principal</span>
                  <span className="font-medium text-foreground">{payment.principal}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">+</span>
                    <span className="text-muted-foreground">Payment to interest</span>
                  </div>
                  <span className="font-medium text-foreground">{payment.interest}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">+</span>
                    <span className="text-muted-foreground">Payment to VAT</span>
                  </div>
                  <span className="font-medium text-foreground">{payment.vat}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">=</span>
                    <span className="font-semibold text-foreground">Payment</span>
                  </div>
                  <span className="font-semibold text-foreground">{payment.total}</span>
                </div>
              </div>
            )}
          </div>
        ))}

        {sortedPayments.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No payment history available
          </div>
        )}
      </div>
    </Card>
  );
};

export default PaymentHistory;
