import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";

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
  onStandChange 
}: InfoCardsProps) => {
  return (
    <div className="space-y-3">
      {/* Payment Progress Bar */}
      <Card className="p-5 shadow-sm">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Payment Progress</h3>
            <span className="text-2xl font-bold text-primary">{progressPercentage}%</span>
          </div>
          <Progress value={progressPercentage} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Total Paid: {totalPaid}</span>
            <span>Balance: {standBalance}</span>
          </div>
        </div>
      </Card>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-3">Last Payment</h3>
          <p className="text-2xl font-bold text-primary">{lastPayment || 'No payments yet'}</p>
          {lastPaymentDate && (
            <p className="text-xs text-muted-foreground mt-1">{lastPaymentDate}</p>
          )}
        </Card>

        <Card className={`p-4 shadow-sm ${isOverdue ? 'border-destructive border-2' : ''}`}>
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Next Payment</h3>
            {isOverdue && <AlertCircle className="h-4 w-4 text-destructive" />}
          </div>
          <p className={`text-2xl font-bold ${isOverdue ? 'text-destructive' : 'text-primary'}`}>
            {nextPayment || 'All paid'}
          </p>
          {nextPaymentDate && (
            <p className="text-xs text-muted-foreground mt-1">
              {nextPaymentDate}
            </p>
          )}
          {isOverdue && daysOverdue > 0 && (
            <p className="text-xs text-destructive mt-1 font-semibold">
              {daysOverdue} days overdue
            </p>
          )}
        </Card>

        <Card className="p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-1">Stand Number</h3>
          <p className="text-lg font-bold text-foreground mb-2">{standNumber}</p>
          <p className="text-xs text-muted-foreground">Current Balance</p>
          <p className="text-base font-bold text-foreground">{standBalance}</p>
        </Card>

        <Card className="p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-3">Total Paid</h3>
          <p className="text-2xl font-bold text-primary">{totalPaid}</p>
        </Card>
      </div>
    </div>
  );
};

export default InfoCards;
