import { Card } from "@/components/ui/card";
import { History } from "lucide-react";

interface PaymentHistoryItem {
  date: string;
  amount: string;
  reference?: string;
  payment_method?: string;
}

interface PaymentHistoryProps {
  payments: PaymentHistoryItem[];
}

const PaymentHistory = ({ payments }: PaymentHistoryProps) => {
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
            <div className="w-full px-4 py-3 flex items-center justify-between">
              <div className="text-left">
                <div className="text-sm text-muted-foreground">
                  {new Date(payment.date).toLocaleDateString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric'
                  })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {payment.reference ? `Ref: ${payment.reference}` : 'Payment'}
                  {payment.payment_method && ` • ${payment.payment_method}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-foreground">
                  {payment.amount}
                </div>
              </div>
            </div>
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
