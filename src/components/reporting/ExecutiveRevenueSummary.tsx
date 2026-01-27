import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { Calendar, TrendingUp, Clock, AlertCircle, CheckCircle } from "lucide-react";

interface Stand {
  standNumber: string;
  payments: Array<{ month: string; amountNumeric: number }>;
  monthlyPayment: string;
  isUnsold: boolean;
  countryCode?: string;
}

interface ExecutiveRevenueSummaryProps {
  stands: Stand[];
  monthColumns: string[];
}

interface TimeBucket {
  label: string;
  sublabel: string;
  type: 'actual' | 'expected';
  amount: number;
  monthCount: number;
  startDate: Date;
  endDate: Date;
}

const ExecutiveRevenueSummary = ({ stands, monthColumns }: ExecutiveRevenueSummaryProps) => {
  const soldStands = useMemo(() => stands.filter(s => !s.isUnsold), [stands]);

  // Parse month column to Date
  const parseMonthColumn = (monthStr: string): Date | null => {
    const match = monthStr.match(/(\d+)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (!match) return null;
    const day = parseInt(match[1]);
    const monthName = match[2].toLowerCase();
    const year = parseInt(match[3]);
    const monthIndex = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(monthName);
    return new Date(year, monthIndex, day);
  };

  // Calculate 90-day buckets
  const buckets = useMemo((): TimeBucket[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Previous 90 days
    const prev90Start = new Date(today);
    prev90Start.setDate(prev90Start.getDate() - 90);
    
    // Current 90 days (today is included)
    const current90End = new Date(today);
    current90End.setDate(current90End.getDate() + 90);
    
    // Next 90 days (after current)
    const next90End = new Date(current90End);
    next90End.setDate(next90End.getDate() + 90);

    // Calculate actual revenue (Previous 90 days)
    let prev90Actual = 0;
    let prev90Months = 0;
    
    // Calculate actual revenue (Current 90 days - to date)
    let current90Actual = 0;
    let current90Months = 0;
    
    // Calculate expected revenue (Next 90 days)
    let next90Expected = 0;
    let next90Months = 0;

    soldStands.forEach(stand => {
      const monthlyPaymentAmount = parseFloat(stand.monthlyPayment.replace(/[$,]/g, '')) || 0;
      
      stand.payments.forEach(payment => {
        const paymentDate = parseMonthColumn(payment.month);
        if (!paymentDate) return;
        
        // Previous 90 days (ACTUAL - already received)
        if (paymentDate >= prev90Start && paymentDate < today) {
          prev90Actual += payment.amountNumeric;
          prev90Months++;
        }
        
        // Current 90 days up to today (ACTUAL - already received)
        if (paymentDate >= today && paymentDate <= current90End && payment.amountNumeric > 0) {
          current90Actual += payment.amountNumeric;
          current90Months++;
        }
      });

      // Calculate expected for next 90 days based on scheduled installments
      monthColumns.forEach(monthCol => {
        const monthDate = parseMonthColumn(monthCol);
        if (!monthDate) return;
        
        // Next 90 days (EXPECTED - not yet received)
        if (monthDate > current90End && monthDate <= next90End) {
          next90Expected += monthlyPaymentAmount;
          next90Months++;
        }
      });
    });

    // Format date range label
    const formatDateRange = (start: Date, end: Date) => {
      const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
    };

    return [
      {
        label: 'Previous 90 Days',
        sublabel: formatDateRange(prev90Start, new Date(today.getTime() - 86400000)),
        type: 'actual',
        amount: prev90Actual,
        monthCount: Math.ceil(prev90Months / soldStands.length) || 0,
        startDate: prev90Start,
        endDate: new Date(today.getTime() - 86400000)
      },
      {
        label: 'Current 90 Days',
        sublabel: formatDateRange(today, current90End),
        type: 'actual',
        amount: current90Actual,
        monthCount: Math.ceil(current90Months / soldStands.length) || 0,
        startDate: today,
        endDate: current90End
      },
      {
        label: 'Next 90 Days',
        sublabel: formatDateRange(new Date(current90End.getTime() + 86400000), next90End),
        type: 'expected',
        amount: next90Expected,
        monthCount: Math.ceil(next90Months / soldStands.length) || 0,
        startDate: new Date(current90End.getTime() + 86400000),
        endDate: next90End
      }
    ];
  }, [soldStands, monthColumns]);

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const totalActual = buckets.filter(b => b.type === 'actual').reduce((sum, b) => sum + b.amount, 0);
  const totalExpected = buckets.filter(b => b.type === 'expected').reduce((sum, b) => sum + b.amount, 0);

  return (
    <TooltipProvider>
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                90-Day Revenue Analysis
              </CardTitle>
              <CardDescription className="mt-1">
                Rolling quarter view · Actual vs Expected
              </CardDescription>
            </div>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-green-600" />
                <span className="text-muted-foreground">Actual Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-slate-300 border border-dashed border-slate-400" />
                <span className="text-muted-foreground">Expected Revenue</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Three Column Layout for 90-Day Buckets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {buckets.map((bucket, idx) => (
              <Tooltip key={idx}>
                <TooltipTrigger asChild>
                  <div 
                    className={`p-4 rounded-lg border-2 transition-all hover:shadow-md cursor-help ${
                      bucket.type === 'actual' 
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                        : 'bg-slate-50 dark:bg-slate-800/50 border-dashed border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {bucket.type === 'actual' ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <Clock className="h-4 w-4 text-slate-400" />
                      )}
                      <Badge 
                        variant={bucket.type === 'actual' ? 'default' : 'outline'}
                        className={bucket.type === 'actual' ? 'bg-green-600' : 'border-dashed'}
                      >
                        {bucket.type === 'actual' ? 'Actual' : 'Expected'}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-sm text-muted-foreground">{bucket.label}</h3>
                    <p className="text-xs text-muted-foreground mb-2">{bucket.sublabel}</p>
                    <p className={`text-2xl font-bold ${
                      bucket.type === 'actual' ? 'text-green-600' : 'text-slate-600 dark:text-slate-300'
                    }`}>
                      {formatCurrency(bucket.amount)}
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-semibold">
                    {bucket.type === 'actual' ? 'Actual Revenue' : 'Expected Revenue'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {bucket.type === 'actual' 
                      ? 'Payments already received and reconciled to payment history.'
                      : 'Scheduled installments not yet due or paid. Based on contracted payment schedules.'}
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* Summary Row */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  Total Actual (180 Days)
                </span>
              </div>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalActual)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Confirmed revenue · Reconciled
              </p>
            </div>
            <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-300">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Total Expected (Next 90 Days)
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{formatCurrency(totalExpected)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Future scheduled · Not yet received
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default ExecutiveRevenueSummary;
