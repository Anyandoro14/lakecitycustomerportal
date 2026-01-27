import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Globe, TrendingUp, TrendingDown } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";

interface Stand {
  standNumber: string;
  payments: Array<{ month: string; amountNumeric: number }>;
  monthlyPayment: string;
  totalPaid: string;
  currentBalance: string;
  isUnsold: boolean;
  countryCode?: string;
}

interface GeographicRevenueProps {
  stands: Stand[];
  monthColumns: string[];
  onCountryFilter?: (countryCode: string) => void;
}

// Country code to name mapping
const COUNTRY_NAMES: Record<string, string> = {
  'ZW': 'Zimbabwe',
  'UK': 'United Kingdom',
  'GB': 'United Kingdom',
  'AU': 'Australia',
  'US': 'United States',
  'CA': 'Canada',
  'ZA': 'South Africa',
  'NZ': 'New Zealand',
  'IE': 'Ireland',
  'DE': 'Germany',
  'FR': 'France',
  'NL': 'Netherlands',
  'AE': 'UAE',
  'SG': 'Singapore',
  'HK': 'Hong Kong',
  '': 'Unknown',
};

// Country colors for chart
const COUNTRY_COLORS: Record<string, string> = {
  'ZW': '#22c55e',
  'UK': '#3b82f6',
  'GB': '#3b82f6',
  'AU': '#f59e0b',
  'US': '#ef4444',
  'CA': '#8b5cf6',
  'ZA': '#06b6d4',
  'DEFAULT': '#94a3b8',
};

const GeographicRevenue = ({ stands, monthColumns, onCountryFilter }: GeographicRevenueProps) => {
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

  // Calculate revenue by country with 90-day buckets
  const geoData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const prev90Start = new Date(today);
    prev90Start.setDate(prev90Start.getDate() - 90);
    
    const current90End = new Date(today);
    current90End.setDate(current90End.getDate() + 90);
    
    const next90End = new Date(current90End);
    next90End.setDate(next90End.getDate() + 90);

    const countryData: Record<string, {
      code: string;
      name: string;
      standCount: number;
      totalReceived: number;
      totalOutstanding: number;
      prev90Actual: number;
      current90Actual: number;
      next90Expected: number;
    }> = {};

    soldStands.forEach(stand => {
      const code = (stand.countryCode || '').toUpperCase().trim() || 'UNKNOWN';
      const name = COUNTRY_NAMES[code] || code;
      
      if (!countryData[code]) {
        countryData[code] = {
          code,
          name,
          standCount: 0,
          totalReceived: 0,
          totalOutstanding: 0,
          prev90Actual: 0,
          current90Actual: 0,
          next90Expected: 0,
        };
      }

      countryData[code].standCount++;
      countryData[code].totalReceived += parseFloat(stand.totalPaid.replace(/[$,]/g, '')) || 0;
      countryData[code].totalOutstanding += parseFloat(stand.currentBalance.replace(/[$,]/g, '')) || 0;

      const monthlyPaymentAmount = parseFloat(stand.monthlyPayment.replace(/[$,]/g, '')) || 0;

      // Calculate 90-day buckets per country
      stand.payments.forEach(payment => {
        const paymentDate = parseMonthColumn(payment.month);
        if (!paymentDate) return;

        if (paymentDate >= prev90Start && paymentDate < today) {
          countryData[code].prev90Actual += payment.amountNumeric;
        }
        if (paymentDate >= today && paymentDate <= current90End && payment.amountNumeric > 0) {
          countryData[code].current90Actual += payment.amountNumeric;
        }
      });

      // Expected for next 90 days
      monthColumns.forEach(monthCol => {
        const monthDate = parseMonthColumn(monthCol);
        if (!monthDate) return;
        
        if (monthDate > current90End && monthDate <= next90End) {
          countryData[code].next90Expected += monthlyPaymentAmount;
        }
      });
    });

    // Sort by total received descending
    return Object.values(countryData).sort((a, b) => b.totalReceived - a.totalReceived);
  }, [soldStands, monthColumns]);

  const totalReceived = geoData.reduce((sum, c) => sum + c.totalReceived, 0);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatCurrencyFull = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Prepare chart data
  const chartData = geoData.slice(0, 8).map(c => ({
    name: c.code,
    fullName: c.name,
    'Previous 90 Days': c.prev90Actual,
    'Current 90 Days': c.current90Actual,
    'Next 90 Days': c.next90Expected,
    color: COUNTRY_COLORS[c.code] || COUNTRY_COLORS['DEFAULT'],
  }));

  return (
    <TooltipProvider>
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Revenue by Geography
              </CardTitle>
              <CardDescription className="mt-1">
                Customer origin breakdown · {geoData.length} regions
              </CardDescription>
            </div>
            <div className="flex gap-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded bg-green-600" />
                <span className="text-muted-foreground">Actual</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded bg-slate-300 border border-dashed" />
                <span className="text-muted-foreground">Expected</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Chart View */}
          {chartData.length > 0 && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis dataKey="name" type="category" width={50} tick={{ fontSize: 12 }} />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [formatCurrencyFull(value), name]}
                    labelFormatter={(label) => {
                      const item = chartData.find(d => d.name === label);
                      return item?.fullName || label;
                    }}
                  />
                  <Legend />
                  <Bar 
                    dataKey="Previous 90 Days" 
                    fill="#22c55e"
                    radius={[0, 0, 0, 0]}
                    stackId="a"
                  />
                  <Bar 
                    dataKey="Current 90 Days" 
                    fill="#16a34a"
                    radius={[0, 0, 0, 0]}
                    stackId="a"
                  />
                  <Bar 
                    dataKey="Next 90 Days" 
                    fill="#94a3b8"
                    radius={[0, 4, 4, 0]}
                    stackId="a"
                    strokeDasharray="3 3"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table View */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-20">Country</TableHead>
                  <TableHead className="text-right">Stands</TableHead>
                  <TableHead className="text-right">Total Received</TableHead>
                  <TableHead className="text-right">% Share</TableHead>
                  <TableHead className="text-right">
                    <Tooltip>
                      <TooltipTrigger className="cursor-help underline decoration-dotted">
                        Prev 90d
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-semibold">Previous 90 Days</p>
                        <p className="text-sm">Actual revenue received</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-right">
                    <Tooltip>
                      <TooltipTrigger className="cursor-help underline decoration-dotted">
                        Curr 90d
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-semibold">Current 90 Days</p>
                        <p className="text-sm">Actual revenue to date</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-right">
                    <Tooltip>
                      <TooltipTrigger className="cursor-help underline decoration-dotted text-slate-500">
                        Next 90d
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-semibold">Next 90 Days</p>
                        <p className="text-sm">Expected / Contracted (not actual)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {geoData.map((country) => {
                  const sharePercent = totalReceived > 0 
                    ? ((country.totalReceived / totalReceived) * 100).toFixed(1)
                    : '0';
                  
                  return (
                    <TableRow 
                      key={country.code}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onCountryFilter?.(country.code)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline" 
                            style={{ 
                              backgroundColor: `${COUNTRY_COLORS[country.code] || COUNTRY_COLORS['DEFAULT']}20`,
                              borderColor: COUNTRY_COLORS[country.code] || COUNTRY_COLORS['DEFAULT']
                            }}
                          >
                            {country.code || '?'}
                          </Badge>
                          <span className="text-sm hidden md:inline">{country.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {country.standCount}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {formatCurrency(country.totalReceived)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Progress 
                            value={parseFloat(sharePercent)} 
                            className="w-16 h-2" 
                          />
                          <span className="text-sm text-muted-foreground w-12">
                            {sharePercent}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-mono text-sm">
                        {formatCurrency(country.prev90Actual)}
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-mono text-sm">
                        {formatCurrency(country.current90Actual)}
                      </TableCell>
                      <TableCell className="text-right text-slate-500 font-mono text-sm">
                        {formatCurrency(country.next90Expected)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground justify-center border-t pt-4">
            <span>Click a row to filter by country</span>
            <span>•</span>
            <span className="text-green-600">Green = Actual revenue (received)</span>
            <span>•</span>
            <span className="text-slate-500">Grey = Expected revenue (future)</span>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default GeographicRevenue;
