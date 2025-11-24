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
    <div className="space-y-2.5">
      {/* Payment Progress Bar */}
      <Card className="p-3.5 shadow-sm">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">Payment Progress</h3>
            <span className="text-xl font-bold text-primary">{progressPercentage}%</span>
          </div>
          <Progress value={progressPercentage} className="h-2.5" />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Total Paid: {totalPaid}</span>
            <span>Balance: {standBalance}</span>
          </div>
        </div>
      </Card>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <Card className="p-3 shadow-sm">
          <h3 className="text-xs font-semibold text-foreground mb-2">Last Payment</h3>
          <p className="text-xl font-bold text-primary break-words">{lastPayment || 'No payments yet'}</p>
          {lastPaymentDate && (
            <p className="text-[11px] text-muted-foreground mt-1">{lastPaymentDate}</p>
          )}
        </Card>

        <Card className={`p-3 shadow-sm ${isOverdue ? 'border-destructive border-2' : ''}`}>
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-xs font-semibold text-foreground">Next Payment</h3>
            {isOverdue && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
          </div>
          <p className={`text-xl font-bold break-words ${isOverdue ? 'text-destructive' : 'text-primary'}`}>
            {nextPayment || 'All paid'}
          </p>
          {nextPaymentDate && (
            <p className="text-[11px] text-muted-foreground mt-1">
              {nextPaymentDate}
            </p>
          )}
          {isOverdue && daysOverdue > 0 && (
            <p className="text-[11px] text-destructive mt-1 font-semibold">
              {daysOverdue} days overdue
            </p>
          )}
        </Card>

        <Card className="p-3 shadow-sm">
          <h3 className="text-xs font-semibold text-foreground mb-2">Current Balance</h3>
          <p className="text-xl font-bold text-primary break-words">{standBalance}</p>
        </Card>

        <Card className="p-3 shadow-sm">
          <h3 className="text-xs font-semibold text-foreground mb-2">Total Paid</h3>
          <p className="text-xl font-bold text-primary break-words">{totalPaid}</p>
        </Card>
      </div>
    </div>
  );
};

export default InfoCards;
