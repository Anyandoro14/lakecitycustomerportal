import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/validation";

interface InfoCardsProps {
  standNumber: string;
  standBalance: string;
  lastPayment: string;
  lastPaymentDate: string;
  nextPayment: string;
  nextPaymentDate: string;
  isOverdue: boolean;
  daysOverdue: number;
  totalPaid: string;
  progressPercentage: number;
  allStands: any[];
  onStandChange: (stand: any) => void;
  paymentNotYetDue?: boolean;
}

const InfoCards = ({ 
  standNumber, 
  standBalance, 
  lastPayment,
  lastPaymentDate,
  nextPayment,
  nextPaymentDate,
  isOverdue,
  daysOverdue,
  totalPaid,
  progressPercentage,
  allStands,
  onStandChange,
  paymentNotYetDue = false
}: InfoCardsProps) => {
  // Format currency values for display
  const formattedTotalPaid = formatCurrency(totalPaid);
  const formattedBalance = formatCurrency(standBalance);
  const formattedLastPayment = lastPayment ? formatCurrency(lastPayment) : null;
  const formattedNextPayment = nextPayment ? formatCurrency(nextPayment) : null;

  return (
    <div className="space-y-3">
      {/* Payment Progress Bar */}
      <Card className="p-4 shadow-sm">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Payment Progress</h3>
            <span className="text-2xl font-bold text-primary">{progressPercentage}%</span>
          </div>
          <Progress value={progressPercentage} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Total Paid: {formattedTotalPaid}</span>
            <span>Balance: {formattedBalance}</span>
          </div>
        </div>
      </Card>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-foreground mb-2">Last Payment</h3>
          <p className="text-lg font-bold text-primary break-words leading-tight">{formattedLastPayment || 'No payments yet'}</p>
          {lastPaymentDate && (
            <p className="text-xs text-muted-foreground mt-1.5">{lastPaymentDate}</p>
          )}
        </Card>

        {/* Next Payment Card - with "Not Yet Due" handling */}
        <Card className={`p-4 shadow-sm ${isOverdue && !paymentNotYetDue ? 'border-destructive border-2' : ''}`}>
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-xs font-semibold text-foreground">Next Payment</h3>
            {isOverdue && !paymentNotYetDue && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
            {paymentNotYetDue && <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
          </div>
          
          {paymentNotYetDue ? (
            <>
              <p className="text-lg font-bold text-muted-foreground break-words leading-tight">
                Not yet due
              </p>
              {nextPaymentDate && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Starts: {nextPaymentDate}
                </p>
              )}
              <p className="text-xs text-green-600 mt-1 font-medium">
                No payment required yet
              </p>
            </>
          ) : (
            <>
              <p className={`text-lg font-bold break-words leading-tight ${isOverdue ? 'text-destructive' : 'text-primary'}`}>
                {formattedNextPayment || 'All paid'}
              </p>
              {nextPaymentDate && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {nextPaymentDate}
                </p>
              )}
              {isOverdue && daysOverdue > 0 && (
                <p className="text-xs text-destructive mt-1 font-semibold">
                  {daysOverdue} days overdue
                </p>
              )}
            </>
          )}
        </Card>

        <Card className="p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-foreground mb-2">Total Paid</h3>
          <p className="text-lg font-bold text-primary break-words leading-tight">{formattedTotalPaid}</p>
        </Card>

        <Card className="p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-foreground mb-2">Current Balance</h3>
          <p className="text-lg font-bold text-primary break-words leading-tight">{formattedBalance}</p>
        </Card>
      </div>
    </div>
  );
};

export default InfoCards;
