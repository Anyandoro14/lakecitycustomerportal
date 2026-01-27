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
import { Globe, Info } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
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

// Phone dial code to ISO country code mapping
const DIAL_CODE_TO_ISO: Record<string, string> = {
  '+1': 'US',      // United States / Canada (default to US)
  '+27': 'ZA',     // South Africa
  '+44': 'GB',     // United Kingdom
  '+61': 'AU',     // Australia
  '+263': 'ZW',    // Zimbabwe
  '+260': 'ZM',    // Zambia
  '+267': 'BW',    // Botswana
  '+258': 'MZ',    // Mozambique
  '+351': 'PT',    // Portugal
};

// ISO code to full country name mapping
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
  'ZM': 'Zambia',
  'BW': 'Botswana',
  'MZ': 'Mozambique',
  'PT': 'Portugal',
  'DE': 'Germany',
  'FR': 'France',
  'NL': 'Netherlands',
  'AE': 'UAE',
  'SG': 'Singapore',
  'HK': 'Hong Kong',
  'UNKNOWN': 'Unknown',
  '': 'Unknown',
};

// Country flag emoji mapping
const COUNTRY_FLAGS: Record<string, string> = {
  'ZW': '🇿🇼',
  'GB': '🇬🇧',
  'UK': '🇬🇧',
  'AU': '🇦🇺',
  'US': '🇺🇸',
  'CA': '🇨🇦',
  'ZA': '🇿🇦',
  'NZ': '🇳🇿',
  'ZM': '🇿🇲',
  'BW': '🇧🇼',
  'MZ': '🇲🇿',
  'PT': '🇵🇹',
  'UNKNOWN': '🌍',
};

// Country colors for chart (LakeCity green for actuals, muted for expected)
const COUNTRY_COLORS: Record<string, string> = {
  'ZW': 'hsl(var(--primary))',
  'GB': '#3b82f6',
  'UK': '#3b82f6',
  'AU': '#f59e0b',
  'US': '#ef4444',
  'CA': '#8b5cf6',
  'ZA': '#06b6d4',
  'ZM': '#10b981',
  'BW': '#f97316',
  'MZ': '#ec4899',
  'PT': '#14b8a6',
  'DEFAULT': '#94a3b8',
};

/**
 * Normalize country code - handles phone numbers being passed as country codes
 * and maps them to proper ISO codes
 */
const normalizeCountryCode = (rawCode: string): string => {
  if (!rawCode) return 'UNKNOWN';
  
  const cleaned = rawCode.toUpperCase().trim();
  
  // If it's already a valid ISO code, return it
  if (COUNTRY_NAMES[cleaned]) {
    return cleaned;
  }
  
  // If it looks like a phone number, extract country code
  if (cleaned.startsWith('+') || /^\d/.test(cleaned)) {
    const phoneClean = cleaned.replace(/[\s\-\(\)]/g, '');
    
    // Check dial codes (most specific first)
    const sortedDialCodes = Object.keys(DIAL_CODE_TO_ISO).sort((a, b) => b.length - a.length);
    for (const dialCode of sortedDialCodes) {
      if (phoneClean.startsWith(dialCode.replace('+', ''))) {
        return DIAL_CODE_TO_ISO[dialCode];
      }
      if (phoneClean.startsWith(dialCode)) {
        return DIAL_CODE_TO_ISO[dialCode];
      }
    }
  }
  
  return 'UNKNOWN';
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

  // Calculate revenue by country with 90-day buckets - ONE ROW PER COUNTRY
  const geoData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const prev90Start = new Date(today);
    prev90Start.setDate(prev90Start.getDate() - 90);
    
    const current90End = new Date(today);
    
    const next90End = new Date(today);
    next90End.setDate(next90End.getDate() + 90);

    // Aggregate by NORMALIZED country code
    const countryData: Record<string, {
      code: string;
      name: string;
      flag: string;
      standCount: number;
      totalReceived: number;
      prev90Actual: number;
      current90Actual: number;
      next90Expected: number;
    }> = {};

    soldStands.forEach(stand => {
      // CRITICAL: Normalize the country code - extract from phone if needed
      const normalizedCode = normalizeCountryCode(stand.countryCode || '');
      const name = COUNTRY_NAMES[normalizedCode] || 'Unknown';
      const flag = COUNTRY_FLAGS[normalizedCode] || '🌍';
      
      if (!countryData[normalizedCode]) {
        countryData[normalizedCode] = {
          code: normalizedCode,
          name,
          flag,
          standCount: 0,
          totalReceived: 0,
          prev90Actual: 0,
          current90Actual: 0,
          next90Expected: 0,
        };
      }

      countryData[normalizedCode].standCount++;
      countryData[normalizedCode].totalReceived += parseFloat(stand.totalPaid.replace(/[$,]/g, '')) || 0;

      const monthlyPaymentAmount = parseFloat(stand.monthlyPayment.replace(/[$,]/g, '')) || 0;

      // Calculate 90-day buckets - ACTUAL payments only for past/current
      stand.payments.forEach(payment => {
        const paymentDate = parseMonthColumn(payment.month);
        if (!paymentDate || payment.amountNumeric <= 0) return;

        // Previous 90 Days: Historical actuals only
        if (paymentDate >= prev90Start && paymentDate < today) {
          countryData[normalizedCode].prev90Actual += payment.amountNumeric;
        }
        // Current period actuals (payments made recently that count toward "current")
        if (paymentDate >= today && paymentDate <= current90End && payment.amountNumeric > 0) {
          countryData[normalizedCode].current90Actual += payment.amountNumeric;
        }
      });

      // Expected for next 90 days - SCHEDULED payments (not actual)
      monthColumns.forEach(monthCol => {
        const monthDate = parseMonthColumn(monthCol);
        if (!monthDate) return;
        
        if (monthDate > today && monthDate <= next90End) {
          // Check if this month has NOT been paid yet
          const isPaid = stand.payments.some(p => p.month === monthCol && p.amountNumeric > 0);
          if (!isPaid) {
            countryData[normalizedCode].next90Expected += monthlyPaymentAmount;
          }
        }
      });
    });

    // Sort by total received descending (as required)
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

  // Prepare chart data - showing actual vs expected clearly separated
  const chartData = geoData.slice(0, 8).map(c => ({
    name: c.name,
    code: c.code,
    flag: c.flag,
    'Actual (Received)': c.prev90Actual + c.current90Actual,
    'Expected (Scheduled)': c.next90Expected,
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
                Customer diaspora breakdown · {geoData.length} countries
              </CardDescription>
            </div>
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-primary" />
                <span className="text-muted-foreground">Actual (Received)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-slate-300 border border-dashed border-slate-400" />
                <span className="text-muted-foreground">Expected (Scheduled)</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Chart View - Horizontal bar chart */}
          {chartData.length > 0 && (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={100} 
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => {
                      const item = chartData.find(d => d.name === value);
                      return `${item?.flag || ''} ${value}`;
                    }}
                  />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [formatCurrencyFull(value), name]}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Bar 
                    dataKey="Actual (Received)" 
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                    name="Actual (Received)"
                  />
                  <Bar 
                    dataKey="Expected (Scheduled)" 
                    fill="#cbd5e1"
                    radius={[0, 4, 4, 0]}
                    name="Expected (Scheduled)"
                    opacity={0.7}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Executive Table View - ONE ROW PER COUNTRY */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Country</TableHead>
                  <TableHead className="text-right font-semibold">Stands</TableHead>
                  <TableHead className="text-right font-semibold">
                    <Tooltip>
                      <TooltipTrigger className="cursor-help underline decoration-dotted decoration-green-600">
                        Total Received
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-semibold text-green-600">Actual Revenue</p>
                        <p className="text-sm">Payments already received and confirmed</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-right font-semibold">% Share</TableHead>
                  <TableHead className="text-right font-semibold">
                    <Tooltip>
                      <TooltipTrigger className="cursor-help underline decoration-dotted decoration-green-600">
                        Prev 90d
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-semibold text-green-600">Previous 90 Days</p>
                        <p className="text-sm">Actual revenue received (historical)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-right font-semibold">
                    <Tooltip>
                      <TooltipTrigger className="cursor-help underline decoration-dotted decoration-green-600">
                        Curr 90d
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-semibold text-green-600">Current 90 Days</p>
                        <p className="text-sm">Actual revenue received to date</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-right font-semibold">
                    <Tooltip>
                      <TooltipTrigger className="cursor-help underline decoration-dotted text-slate-500">
                        Next 90d
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-semibold text-slate-600">Next 90 Days</p>
                        <p className="text-sm">Expected / Scheduled (NOT actual)</p>
                        <p className="text-xs text-amber-600 mt-1">⚠️ Contracted only, not received</p>
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
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => onCountryFilter?.(country.code)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{country.flag}</span>
                          <span className="font-medium">{country.name}</span>
                          <Badge 
                            variant="outline" 
                            className="text-xs opacity-60"
                          >
                            {country.code}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {country.standCount}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-primary">
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
                      <TableCell className="text-right text-primary font-mono text-sm">
                        {formatCurrency(country.prev90Actual)}
                      </TableCell>
                      <TableCell className="text-right text-primary font-mono text-sm">
                        {formatCurrency(country.current90Actual)}
                      </TableCell>
                      <TableCell className="text-right text-slate-500 font-mono text-sm italic">
                        {formatCurrency(country.next90Expected)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Executive Legend & Footnotes */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground justify-center">
              <div className="flex items-center gap-1">
                <Info className="h-3 w-3" />
                <span>Click any row to filter by country</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-xs justify-center">
              <span className="text-primary font-medium">● Actual = Confirmed payments received</span>
              <span className="text-slate-500 font-medium italic">● Expected = Scheduled instalments (not yet received)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default GeographicRevenue;