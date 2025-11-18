import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

interface PaymentSummaryProps {
  currentBalance: string;
  lastDueDate: string;
  monthlyPayment: string;
  nextDueDate: string;
}

const PaymentSummary = ({ currentBalance, lastDueDate, monthlyPayment, nextDueDate }: PaymentSummaryProps) => {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="p-4 bg-primary text-primary-foreground shadow-sm">
        <h3 className="text-sm font-semibold mb-3">Agreement of Sale</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="h-4 w-4" />
            <span>Current Balance</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="h-4 w-4" />
            <span>Last Due Date</span>
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-primary text-primary-foreground shadow-sm">
        <h3 className="text-sm font-semibold mb-3">Payment Schedule</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="h-4 w-4" />
            <span>Monthly Payment</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="h-4 w-4" />
            <span>Next Due ({nextDueDate})</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default PaymentSummary;
