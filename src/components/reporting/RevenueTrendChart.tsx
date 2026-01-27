import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TrendingUp, Info } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Area,
} from "recharts";

interface Stand {
  standNumber: string;
  payments: Array<{ month: string; amountNumeric: number }>;
  monthlyPayment: string;
  isUnsold: boolean;
}

interface RevenueTrendChartProps {
  stands: Stand[];
  monthColumns: string[];
}

interface MonthlyDataPoint {
  monthKey: string;
  monthLabel: string;
  fullLabel: string;
  date: Date;
  actual: number;
  expected: number;
  isPast: boolean;
  isCurrent: boolean;
  isFuture: boolean;
}

const RevenueTrendChart = ({ stands, monthColumns }: RevenueTrendChartProps) => {
  const soldStands = useMemo(() => stands.filter(s => !s.isUnsold), [stands]);

  // Parse month column to Date
  const parseMonthColumn = (monthStr: string): { date: Date; monthName: string; year: string } | null => {
    const match = monthStr.match(/(\d+)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (!match) return null;
    const day = parseInt(match[1]);
    const monthName = match[2];
    const year = match[3];
    const monthIndex = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(monthName.toLowerCase());
    return { 
      date: new Date(parseInt(year), monthIndex, day),
      monthName,
      year
    };
  };

  // Build monthly data - always show 3 years (36 months) starting from 2025
  const chartData = useMemo((): MonthlyDataPoint[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const monthlyData: Record<string, MonthlyDataPoint> = {};

    // Define 3-year range: start from January 2025, end 36 months later
    const startYear = 2025;
    const startMonth = 0; // January
    const totalMonths = 36; // 3 years

    // Pre-populate all 36 months in the range
    for (let i = 0; i < totalMonths; i++) {
      const date = new Date(startYear, startMonth + i, 5);
      const year = date.getFullYear().toString();
      const monthIndex = date.getMonth();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthName = monthNames[monthIndex];
      const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

      const isPast = date < new Date(currentYear, currentMonth, 1);
      const isCurrent = date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      const isFuture = !isPast && !isCurrent;

      monthlyData[monthKey] = {
        monthKey,
        monthLabel: `${monthName.substring(0, 3)} '${year.substring(2)}`,
        fullLabel: `${monthName} ${year}`,
        date,
        actual: 0,
        expected: 0,
        isPast,
        isCurrent,
        isFuture,
      };
    }

    // Add expected amounts from month columns that fall within our range
    monthColumns.forEach(monthCol => {
      const parsed = parseMonthColumn(monthCol);
      if (!parsed) return;

      const monthKey = `${parsed.year}-${String(parsed.date.getMonth() + 1).padStart(2, '0')}`;
      
      // Only add if this month is in our 3-year range
      if (monthlyData[monthKey]) {
        soldStands.forEach(stand => {
          const monthlyPaymentAmount = parseFloat(stand.monthlyPayment.replace(/[$,]/g, '')) || 0;
          monthlyData[monthKey].expected += monthlyPaymentAmount;
        });
      }
    });

    // Add actual payments received
    soldStands.forEach(stand => {
      stand.payments.forEach(payment => {
        const parsed = parseMonthColumn(payment.month);
        if (!parsed) return;

        const monthKey = `${parsed.year}-${String(parsed.date.getMonth() + 1).padStart(2, '0')}`;
        
        if (monthlyData[monthKey]) {
          monthlyData[monthKey].actual += payment.amountNumeric;
        }
      });
    });

    // Sort by date and return all 36 months
    return Object.values(monthlyData)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [soldStands, monthColumns]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const formatCurrencyFull = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const dataPoint = chartData.find(d => d.monthLabel === label);
    const actualValue = payload.find((p: any) => p.dataKey === 'actual')?.value || 0;
    const expectedValue = payload.find((p: any) => p.dataKey === 'expected')?.value || 0;
    const collectionRate = expectedValue > 0 ? ((actualValue / expectedValue) * 100).toFixed(1) : '0';

    return (
      <div className="bg-background border rounded-lg p-4 shadow-lg">
        <p className="font-semibold text-sm mb-2">{dataPoint?.fullLabel || label}</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-green-600 flex items-center gap-1">
              <div className="w-2 h-2 rounded bg-green-600" />
              Actual Revenue:
            </span>
            <span className="font-semibold">{formatCurrencyFull(actualValue)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 flex items-center gap-1">
              <div className="w-2 h-2 rounded bg-slate-300" />
              Expected:
            </span>
            <span className="font-semibold">{formatCurrencyFull(expectedValue)}</span>
          </div>
          <div className="border-t pt-1 mt-1">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Collection Rate:</span>
              <span className={`font-bold ${parseFloat(collectionRate) >= 100 ? 'text-green-600' : parseFloat(collectionRate) >= 80 ? 'text-amber-600' : 'text-destructive'}`}>
                {collectionRate}%
              </span>
            </div>
          </div>
          {dataPoint?.isFuture && (
            <p className="text-xs text-muted-foreground italic mt-2 border-t pt-2">
              ⚠️ Future month - Expected only, not actual
            </p>
          )}
        </div>
      </div>
    );
  };

  // Find current month index for reference line
  const currentMonthIdx = chartData.findIndex(d => d.isCurrent);

  return (
    <TooltipProvider>
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Revenue Trend: Past → Present → Future
              </CardTitle>
              <CardDescription className="mt-1">
                Actual vs Expected revenue over time
              </CardDescription>
            </div>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="flex items-center gap-1 cursor-help">
                  <Info className="h-3 w-3" />
                  Reading this chart
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">How to read this chart</p>
                <ul className="text-sm space-y-1">
                  <li><span className="text-green-600 font-semibold">Green bars</span> = Actual revenue received</li>
                  <li><span className="text-slate-500 font-semibold">Grey dashed area</span> = Expected / scheduled revenue</li>
                  <li>Future months show expected only (no actual yet)</li>
                  <li>Current month marked with vertical line</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="expectedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="monthLabel" 
                  tick={{ fontSize: 11 }}
                  tickMargin={8}
                />
                <YAxis 
                  tickFormatter={(v) => formatCurrency(v)}
                  tick={{ fontSize: 11 }}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend 
                  formatter={(value) => {
                    if (value === 'expected') return 'Expected Revenue (Scheduled)';
                    if (value === 'actual') return 'Actual Revenue (Received)';
                    return value;
                  }}
                />
                
                {/* Expected as area (background) */}
                <Area
                  type="monotone"
                  dataKey="expected"
                  fill="url(#expectedGradient)"
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  name="expected"
                />
                
                {/* Actual as bars (foreground) */}
                <Bar
                  dataKey="actual"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  name="actual"
                />
                
                {/* Current month reference line */}
                {currentMonthIdx >= 0 && chartData[currentMonthIdx] && (
                  <ReferenceLine
                    x={chartData[currentMonthIdx].monthLabel}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    label={{ 
                      value: 'Today', 
                      position: 'top',
                      fill: '#3b82f6',
                      fontSize: 11
                    }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Legend explanation */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-4 pt-4 border-t text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-600" />
              <span className="text-muted-foreground">Actual Revenue</span>
              <span className="text-xs text-green-600">(Confirmed)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-slate-200 border border-dashed border-slate-400" />
              <span className="text-muted-foreground">Expected Revenue</span>
              <span className="text-xs text-slate-500">(Scheduled)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 border-t-2 border-dashed border-blue-500" />
              <span className="text-muted-foreground">Current Month</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default RevenueTrendChart;
