import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Users, Filter, X, Download, UserCheck, UserX, Calendar, AlertTriangle, CheckCircle, BarChart3, Target, Globe, Info } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import InternalNav from "@/components/InternalNav";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ExecutiveRevenueSummary from "@/components/reporting/ExecutiveRevenueSummary";
import GeographicRevenue from "@/components/reporting/GeographicRevenue";
import RevenueTrendChart from "@/components/reporting/RevenueTrendChart";

const Reporting = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isDirector, setIsDirector] = useState(false);
  const [reportingData, setReportingData] = useState<any>(null);
  const [registrationStats, setRegistrationStats] = useState<any>(null);
  const [selectedStand, setSelectedStand] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showUnregisteredList, setShowUnregisteredList] = useState(false);
  
  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedPriceRanges, setSelectedPriceRanges] = useState<string[]>([]);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);
  const [filterOfferReceived, setFilterOfferReceived] = useState<boolean | null>(null);
  const [filterInitialPayment, setFilterInitialPayment] = useState<boolean | null>(null);
  const [filterAgreementRequested, setFilterAgreementRequested] = useState<boolean | null>(null);
  const [filterAgreementSignedWarwickshire, setFilterAgreementSignedWarwickshire] = useState<boolean | null>(null);
  const [filterAgreementSignedClient, setFilterAgreementSignedClient] = useState<boolean | null>(null);
  
  // Payment status filter
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string | null>(null);
  
  // Year filter for monthly data
  const [selectedYear, setSelectedYear] = useState<string>("all");

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Please log in to access reporting");
        navigate("/login");
        return;
      }

      const { data, error } = await supabase.functions.invoke('check-reporting-access');
      
      if (error) throw error;

      if (!data.hasAccess) {
        toast.error("Access denied. You don't have permission to view reporting.");
        navigate("/");
        return;
      }

      setHasAccess(true);
      setIsSuperAdmin(data.isSuperAdmin);
      setIsDirector(data.isDirector || false);
      await Promise.all([
        fetchReportingData(),
        fetchRegistrationStats()
      ]);
    } catch (error: any) {
      console.error('Error checking access:', error);
      toast.error("Failed to verify access");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const fetchReportingData = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-reporting-data');
      
      if (error) throw error;
      
      setReportingData(data);
    } catch (error: any) {
      console.error('Error fetching reporting data:', error);
      toast.error("Failed to load reporting data");
    }
  };

  const fetchRegistrationStats = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-registration-stats');
      
      if (error) throw error;
      
      setRegistrationStats(data);
    } catch (error: any) {
      console.error('Error fetching registration stats:', error);
    }
  };

  // Price range definitions
  const priceRanges = [
    { label: "$10,000 - $15,000", min: 10000, max: 15000 },
    { label: "$15,001 - $25,000", min: 15001, max: 25000 },
    { label: "$25,001 - $50,000", min: 25001, max: 50000 },
    { label: "$50,001 - $75,000", min: 50001, max: 75000 },
    { label: "$75,001 - $100,000", min: 75001, max: 100000 },
    { label: "$100,001+", min: 100001, max: Infinity },
  ];
  
  // Payment status filter options with better labels
  const paymentStatusOptions = [
    { label: "All Overdue", value: "overdue_any", minDays: 1, maxDays: Infinity, type: "overdue" },
    { label: "3+ days", value: "overdue_3", minDays: 3, maxDays: Infinity, type: "overdue" },
    { label: "7+ days", value: "overdue_7", minDays: 7, maxDays: Infinity, type: "overdue" },
    { label: "14+ days", value: "overdue_14", minDays: 14, maxDays: Infinity, type: "overdue" },
    { label: "21+ days", value: "overdue_21", minDays: 21, maxDays: Infinity, type: "overdue" },
    { label: "30+ days", value: "overdue_30", minDays: 30, maxDays: Infinity, type: "overdue" },
    { label: "90+ days", value: "overdue_90", minDays: 90, maxDays: Infinity, type: "overdue" },
    { label: "180+ days", value: "overdue_180", minDays: 180, maxDays: Infinity, type: "overdue" },
    { label: "All Prepaid", value: "prepaid_any", minDays: 1, maxDays: Infinity, type: "prepaid" },
    { label: "3+ days", value: "prepaid_3", minDays: 3, maxDays: Infinity, type: "prepaid" },
    { label: "7+ days", value: "prepaid_7", minDays: 7, maxDays: Infinity, type: "prepaid" },
    { label: "14+ days", value: "prepaid_14", minDays: 14, maxDays: Infinity, type: "prepaid" },
    { label: "30+ days", value: "prepaid_30", minDays: 30, maxDays: Infinity, type: "prepaid" },
    { label: "90+ days", value: "prepaid_90", minDays: 90, maxDays: Infinity, type: "prepaid" },
  ];
  
  // Get unique customer categories
  const uniqueCategories = useMemo(() => {
    if (!reportingData?.stands) return [];
    const categories = new Set<string>();
    reportingData.stands.forEach((s: any) => {
      if (s.customerCategory && s.customerCategory.trim()) {
        categories.add(s.customerCategory.trim());
      }
    });
    return Array.from(categories).sort();
  }, [reportingData?.stands]);

  // Get unique years from the calculated monthly totals (actual payment data)
  // This ensures years only appear if there's actual payment data for them
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    
    // First, get years from filteredMonthlyTotals (actual payment data)
    if (reportingData?.stands) {
      reportingData.stands.forEach((stand: any) => {
        if (stand.isUnsold) return;
        stand.payments?.forEach((payment: any) => {
          const match = payment.month?.match(/(\d{4})$/);
          if (match) years.add(match[1]);
        });
      });
    }
    
    // Fallback to monthlyTotals from API if no stands data
    if (years.size === 0 && reportingData?.monthlyTotals) {
      reportingData.monthlyTotals.forEach((m: any) => {
        const match = m.month?.match(/(\d{4})$/);
        if (match) years.add(match[1]);
      });
    }
    
    return Array.from(years).sort().reverse();
  }, [reportingData?.stands, reportingData?.monthlyTotals]);
  
  // Apply filters
  const filteredStands = useMemo(() => {
    if (!reportingData?.stands) return [];
    
    return reportingData.stands.filter((stand: any) => {
      if (stand.isUnsold) return true;
      
      if (selectedCategories.length > 0) {
        if (!selectedCategories.includes(stand.customerCategory)) return false;
      }
      
      if (selectedPriceRanges.length > 0) {
        const inRange = selectedPriceRanges.some(rangeLabel => {
          const range = priceRanges.find(r => r.label === rangeLabel);
          if (!range) return false;
          return stand.priceNumeric >= range.min && stand.priceNumeric <= range.max;
        });
        if (!inRange) return false;
      }
      
      // Country code filter
      if (selectedCountryCode) {
        const standCountry = (stand.countryCode || '').toUpperCase().trim();
        if (selectedCountryCode === 'UNKNOWN') {
          if (standCountry && standCountry !== '') return false;
        } else {
          if (standCountry !== selectedCountryCode) return false;
        }
      }
      
      if (filterOfferReceived !== null && stand.offerReceived !== filterOfferReceived) return false;
      if (filterInitialPayment !== null && stand.initialPaymentCompleted !== filterInitialPayment) return false;
      if (filterAgreementRequested !== null && stand.agreementRequested !== filterAgreementRequested) return false;
      if (filterAgreementSignedWarwickshire !== null && stand.agreementSignedWarwickshire !== filterAgreementSignedWarwickshire) return false;
      if (filterAgreementSignedClient !== null && stand.agreementSignedClient !== filterAgreementSignedClient) return false;
      
      if (paymentStatusFilter) {
        const filterOption = paymentStatusOptions.find(opt => opt.value === paymentStatusFilter);
        if (filterOption) {
          if (filterOption.type === "overdue") {
            if ((stand.daysOverdue || 0) < filterOption.minDays) return false;
          } else if (filterOption.type === "prepaid") {
            if ((stand.prepaidDays || 0) < filterOption.minDays) return false;
          }
        }
      }
      
      return true;
    });
  }, [reportingData?.stands, selectedCategories, selectedPriceRanges, filterOfferReceived, filterInitialPayment, filterAgreementRequested, filterAgreementSignedWarwickshire, filterAgreementSignedClient, paymentStatusFilter]);
  
  const soldStands = useMemo(() => filteredStands.filter((s: any) => !s.isUnsold), [filteredStands]);
  const unsoldStands = useMemo(() => filteredStands.filter((s: any) => s.isUnsold), [filteredStands]);
  
  // Calculate overdue and prepaid counts for summary tiles
  const overdueStats = useMemo(() => {
    if (!reportingData?.stands) return { total: 0, byDays: {} };
    const soldOnly = reportingData.stands.filter((s: any) => !s.isUnsold);
    const overdue = soldOnly.filter((s: any) => s.daysOverdue > 0);
    
    return {
      total: overdue.length,
      byDays: {
        3: overdue.filter((s: any) => s.daysOverdue >= 3).length,
        7: overdue.filter((s: any) => s.daysOverdue >= 7).length,
        14: overdue.filter((s: any) => s.daysOverdue >= 14).length,
        30: overdue.filter((s: any) => s.daysOverdue >= 30).length,
        90: overdue.filter((s: any) => s.daysOverdue >= 90).length,
      },
      totalAmount: overdue.reduce((sum: number, s: any) => {
        const balance = parseFloat(s.currentBalance.replace(/[$,]/g, '')) || 0;
        return sum + balance;
      }, 0)
    };
  }, [reportingData?.stands]);

  const prepaidStats = useMemo(() => {
    if (!reportingData?.stands) return { total: 0, byDays: {} };
    const soldOnly = reportingData.stands.filter((s: any) => !s.isUnsold);
    const prepaid = soldOnly.filter((s: any) => s.prepaidDays > 0);
    
    return {
      total: prepaid.length,
      byDays: {
        3: prepaid.filter((s: any) => s.prepaidDays >= 3).length,
        7: prepaid.filter((s: any) => s.prepaidDays >= 7).length,
        14: prepaid.filter((s: any) => s.prepaidDays >= 14).length,
        30: prepaid.filter((s: any) => s.prepaidDays >= 30).length,
        90: prepaid.filter((s: any) => s.prepaidDays >= 90).length,
      }
    };
  }, [reportingData?.stands]);
  
  // Recalculate summary based on filtered data
  const filteredSummary = useMemo(() => {
    const totalExpected = soldStands.reduce((sum: number, s: any) => {
      const price = parseFloat(s.totalPrice.replace(/[$,]/g, '')) || 0;
      return sum + price;
    }, 0);

    const totalReceived = soldStands.reduce((sum: number, s: any) => {
      const paid = parseFloat(s.totalPaid.replace(/[$,]/g, '')) || 0;
      return sum + paid;
    }, 0);

    const totalOutstanding = soldStands.reduce((sum: number, s: any) => {
      const balance = parseFloat(s.currentBalance.replace(/[$,]/g, '')) || 0;
      return sum + balance;
    }, 0);
    
    return {
      totalExpected,
      totalReceived,
      totalOutstanding,
      collectionPercentage: totalExpected > 0 ? ((totalReceived / totalExpected) * 100).toFixed(2) : '0',
    };
  }, [soldStands]);
  
  // Recalculate monthly totals based on filtered stands with proper year grouping
  const filteredMonthlyTotals = useMemo(() => {
    const monthlyData: { [key: string]: { expected: number; received: number; count: number; year: string; monthIndex: number; monthName: string } } = {};
    
    soldStands.forEach((stand: any) => {
      const monthlyPaymentAmount = parseFloat(stand.monthlyPayment.replace(/[$,]/g, '')) || 0;
      
      stand.payments.forEach((payment: any) => {
        // Parse the full date like "5 November 2025"
        const match = payment.month.match(/\d+\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
        if (!match) return;
        
        const monthName = match[1];
        const year = match[2];
        const key = `${monthName} ${year}`;
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const monthIndex = monthNames.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
        
        if (!monthlyData[key]) {
          monthlyData[key] = { expected: 0, received: 0, count: 0, year, monthIndex, monthName };
        }
        monthlyData[key].received += payment.amountNumeric;
        monthlyData[key].expected += monthlyPaymentAmount;
        monthlyData[key].count += 1;
      });
    });
    
    // Sort by date
    return Object.entries(monthlyData)
      .map(([key, data]) => ({
        month: key,
        ...data,
        percentage: data.expected > 0 ? ((data.received / data.expected) * 100).toFixed(2) : '0',
      }))
      .sort((a, b) => {
        if (a.year !== b.year) return parseInt(a.year) - parseInt(b.year);
        return a.monthIndex - b.monthIndex;
      });
  }, [soldStands]);

  // Filter monthly totals by selected year
  const yearFilteredMonthlyTotals = useMemo(() => {
    if (selectedYear === "all") return filteredMonthlyTotals;
    return filteredMonthlyTotals.filter(m => m.year === selectedYear);
  }, [filteredMonthlyTotals, selectedYear]);

  // Calculate trends by customer category
  const categoryTrends = useMemo(() => {
    if (!reportingData?.stands) return [];
    
    const categoryData: { [category: string]: { received: number; expected: number; outstanding: number; count: number } } = {};
    
    soldStands.forEach((stand: any) => {
      const category = stand.customerCategory || 'Uncategorized';
      if (!categoryData[category]) {
        categoryData[category] = { received: 0, expected: 0, outstanding: 0, count: 0 };
      }
      
      const price = parseFloat(stand.totalPrice.replace(/[$,]/g, '')) || 0;
      const paid = parseFloat(stand.totalPaid.replace(/[$,]/g, '')) || 0;
      const balance = parseFloat(stand.currentBalance.replace(/[$,]/g, '')) || 0;
      
      categoryData[category].expected += price;
      categoryData[category].received += paid;
      categoryData[category].outstanding += balance;
      categoryData[category].count += 1;
    });
    
    return Object.entries(categoryData)
      .map(([category, data]) => ({
        category,
        ...data,
        collectionRate: data.expected > 0 ? ((data.received / data.expected) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.received - a.received);
  }, [soldStands, reportingData?.stands]);
  
  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedPriceRanges([]);
    setSelectedCountryCode(null);
    setFilterOfferReceived(null);
    setFilterInitialPayment(null);
    setFilterAgreementRequested(null);
    setFilterAgreementSignedWarwickshire(null);
    setFilterAgreementSignedClient(null);
    setPaymentStatusFilter(null);
  };
  
  const hasActiveFilters = selectedCategories.length > 0 || selectedPriceRanges.length > 0 || 
    selectedCountryCode !== null ||
    filterOfferReceived !== null || filterInitialPayment !== null || 
    filterAgreementRequested !== null || filterAgreementSignedWarwickshire !== null || 
    filterAgreementSignedClient !== null || paymentStatusFilter !== null;

  const applyCountryFilter = (countryCode: string) => {
    clearAllFilters();
    setSelectedCountryCode(countryCode);
  };

  const exportToCSV = () => {
    const headers = ['Stand', 'Customer', 'Country', 'Category', 'Total Price', 'Monthly Payment', 'Total Paid', 'Balance', 'Progress %', 'Days Overdue', 'Days Prepaid'];
    const rows = soldStands.map((stand: any) => [
      stand.standNumber,
      stand.customerName,
      stand.countryCode || '',
      stand.customerCategory || '',
      stand.totalPrice,
      stand.monthlyPayment,
      stand.totalPaid,
      stand.currentBalance,
      `${stand.progressPercentage}%`,
      stand.daysOverdue || 0,
      stand.prepaidDays || 0
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map((cell: string) => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `lakecity-stands-report-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report exported successfully');
  };

  // Quick filter handlers for interactive tiles
  const applyQuickFilter = (type: 'overdue' | 'prepaid', days?: number) => {
    clearAllFilters();
    if (type === 'overdue') {
      setPaymentStatusFilter(days ? `overdue_${days}` : 'overdue_any');
    } else {
      setPaymentStatusFilter(days ? `prepaid_${days}` : 'prepaid_any');
    }
  };

  const applyCategoryFilter = (category: string) => {
    clearAllFilters();
    setSelectedCategories([category]);
  };

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess || !reportingData) {
    return null;
  }

  // Prepare chart data with year indicators and trend calculation
  const monthlyChartData = yearFilteredMonthlyTotals.map((m: any, index: number, arr: any[]) => {
    // Calculate moving average trend (3-month rolling average of collection rate)
    let trend = null;
    if (index >= 2) {
      const last3 = arr.slice(index - 2, index + 1);
      const avgRate = last3.reduce((sum: number, item: any) => sum + parseFloat(item.percentage), 0) / 3;
      trend = avgRate;
    } else if (index === 1) {
      const last2 = arr.slice(0, index + 1);
      const avgRate = last2.reduce((sum: number, item: any) => sum + parseFloat(item.percentage), 0) / 2;
      trend = avgRate;
    } else {
      trend = parseFloat(m.percentage);
    }
    
    return {
      month: `${m.monthName.substring(0, 3)} ${m.year.substring(2)}`,
      fullMonth: `${m.monthName} ${m.year}`,
      expected: m.expected,
      received: m.received,
      percentage: parseFloat(m.percentage),
      variance: m.received - m.expected,
      trend: trend
    };
  });

  // Get last 3 months for summary tiles
  const today = new Date();
  const getLast3MonthsData = () => {
    const months = [];
    for (let i = 0; i < 4; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthName = date.toLocaleDateString('en-US', { month: 'long' });
      const year = date.getFullYear();
      
      const monthData = filteredMonthlyTotals.find((m: any) => 
        m.monthName === monthName && m.year === year.toString()
      );
      
      months.push({
        month: monthName,
        year: year.toString(),
        fullLabel: `${monthName} ${year}`,
        received: monthData ? monthData.received : 0,
        expected: monthData ? monthData.expected : 0
      });
    }
    return months;
  };
  
  const last4Months = getLast3MonthsData();
  const last3MonthsDisplay = last4Months.slice(0, 3).map((month: any, idx: number) => {
    const previousMonth = last4Months[idx + 1];
    const delta = previousMonth ? month.received - previousMonth.received : null;
    return {
      ...month,
      delta,
      previousMonthName: previousMonth ? previousMonth.month : null
    };
  }).reverse();

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 md:p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl md:text-3xl font-bold">Financial Reporting</h1>
            <p className="text-sm md:text-base text-primary-foreground/80">LakeCity Collections Dashboard</p>
          </div>
          <InternalNav 
            isSuperAdmin={isSuperAdmin} 
            isDirector={isDirector} 
            currentPage="reporting"
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Filter Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-2">Active</Badge>
                )}
              </CardTitle>
              <div className="flex gap-2">
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearAllFilters}>
                    <X className="h-4 w-4 mr-2" />
                    Clear All
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  {showFilters ? 'Hide' : 'Show'} Filters
                </Button>
              </div>
            </div>
          </CardHeader>
          {showFilters && (
            <CardContent className="space-y-6">
              {/* Customer Category Filter */}
              {uniqueCategories.length > 0 && (
                <div>
                  <Label className="text-sm font-semibold mb-3 block">Customer Category</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {uniqueCategories.map((category) => (
                      <div key={category} className="flex items-center space-x-2">
                        <Checkbox
                          id={`cat-${category}`}
                          checked={selectedCategories.includes(category)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCategories([...selectedCategories, category]);
                            } else {
                              setSelectedCategories(selectedCategories.filter(c => c !== category));
                            }
                          }}
                        />
                        <Label htmlFor={`cat-${category}`} className="text-sm cursor-pointer">
                          {category}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Price Range Filter */}
              <div>
                <Label className="text-sm font-semibold mb-3 block">Price Range</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {priceRanges.map((range) => (
                    <div key={range.label} className="flex items-center space-x-2">
                      <Checkbox
                        id={`price-${range.label}`}
                        checked={selectedPriceRanges.includes(range.label)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedPriceRanges([...selectedPriceRanges, range.label]);
                          } else {
                            setSelectedPriceRanges(selectedPriceRanges.filter(p => p !== range.label));
                          }
                        }}
                      />
                      <Label htmlFor={`price-${range.label}`} className="text-sm cursor-pointer">
                        {range.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Payment Status Filter */}
              <div>
                <Label className="text-sm font-semibold mb-3 block">Payment Status</Label>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Overdue</p>
                    <div className="flex flex-wrap gap-2">
                      {paymentStatusOptions.filter(o => o.type === 'overdue').map((option) => (
                        <Button
                          key={option.value}
                          variant={paymentStatusFilter === option.value ? "default" : "outline"}
                          size="sm"
                          className={`text-xs ${paymentStatusFilter === option.value ? 'bg-destructive hover:bg-destructive/90' : 'border-destructive/30 text-destructive hover:bg-destructive/10'}`}
                          onClick={() => setPaymentStatusFilter(paymentStatusFilter === option.value ? null : option.value)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Prepaid</p>
                    <div className="flex flex-wrap gap-2">
                      {paymentStatusOptions.filter(o => o.type === 'prepaid').map((option) => (
                        <Button
                          key={option.value}
                          variant={paymentStatusFilter === option.value ? "default" : "outline"}
                          size="sm"
                          className={`text-xs ${paymentStatusFilter === option.value ? 'bg-green-600 hover:bg-green-700' : 'border-green-300 text-green-700 hover:bg-green-50'}`}
                          onClick={() => setPaymentStatusFilter(paymentStatusFilter === option.value ? null : option.value)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Boolean Filters */}
              <div>
                <Label className="text-sm font-semibold mb-3 block">Agreement Status</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Offer Received</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={filterOfferReceived === true ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterOfferReceived(filterOfferReceived === true ? null : true)}
                      >
                        Yes
                      </Button>
                      <Button
                        variant={filterOfferReceived === false ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterOfferReceived(filterOfferReceived === false ? null : false)}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Initial Payment Completed</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={filterInitialPayment === true ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterInitialPayment(filterInitialPayment === true ? null : true)}
                      >
                        Yes
                      </Button>
                      <Button
                        variant={filterInitialPayment === false ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterInitialPayment(filterInitialPayment === false ? null : false)}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Agreement Requested</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={filterAgreementRequested === true ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterAgreementRequested(filterAgreementRequested === true ? null : true)}
                      >
                        Yes
                      </Button>
                      <Button
                        variant={filterAgreementRequested === false ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterAgreementRequested(filterAgreementRequested === false ? null : false)}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Agreement Signed (Warwickshire)</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={filterAgreementSignedWarwickshire === true ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterAgreementSignedWarwickshire(filterAgreementSignedWarwickshire === true ? null : true)}
                      >
                        Yes
                      </Button>
                      <Button
                        variant={filterAgreementSignedWarwickshire === false ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterAgreementSignedWarwickshire(filterAgreementSignedWarwickshire === false ? null : false)}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Agreement Signed (Client)</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={filterAgreementSignedClient === true ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterAgreementSignedClient(filterAgreementSignedClient === true ? null : true)}
                      >
                        Yes
                      </Button>
                      <Button
                        variant={filterAgreementSignedClient === false ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterAgreementSignedClient(filterAgreementSignedClient === false ? null : false)}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
        
        {/* Summary Warning */}
        {soldStands.length === 0 && hasActiveFilters && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-yellow-800 font-medium">No stands match your current filters</p>
            <p className="text-yellow-700 text-sm mt-1">
              Try clearing some filters to see more results.
            </p>
          </div>
        )}
        
        {/* Main Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => clearAllFilters()}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Target className="h-4 w-4" />
                Total Expected (Forecast)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl md:text-2xl font-bold">{formatCurrency(filteredSummary.totalExpected)}</p>
              <p className="text-xs text-muted-foreground mt-1">{soldStands.length} active stands</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow border-green-200" onClick={() => clearAllFilters()}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Revenue Collected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl md:text-2xl font-bold text-green-600">{formatCurrency(filteredSummary.totalReceived)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {filteredSummary.collectionPercentage}% of forecast
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow border-red-200" onClick={() => applyQuickFilter('overdue')}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                Outstanding Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl md:text-2xl font-bold text-destructive">{formatCurrency(filteredSummary.totalOutstanding)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {overdueStats.total} accounts overdue
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => clearAllFilters()}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Collection Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl md:text-2xl font-bold">{filteredSummary.collectionPercentage}%</p>
              <Progress value={parseFloat(filteredSummary.collectionPercentage)} className="mt-2 h-2" />
            </CardContent>
          </Card>
        </div>

        {/* Executive 90-Day Revenue Summary */}
        {reportingData?.monthColumns && (
          <ExecutiveRevenueSummary 
            stands={soldStands} 
            monthColumns={reportingData.monthColumns}
          />
        )}

        {/* Geographic Revenue Breakdown */}
        {reportingData?.monthColumns && (
          <GeographicRevenue 
            stands={soldStands} 
            monthColumns={reportingData.monthColumns}
            onCountryFilter={applyCountryFilter}
            selectedCountryCode={selectedCountryCode}
            onClearFilter={() => setSelectedCountryCode(null)}
          />
        )}

        {/* Revenue Trend Chart */}
        {reportingData?.monthColumns && (
          <RevenueTrendChart 
            stands={soldStands} 
            monthColumns={reportingData.monthColumns}
          />
        )}

        {/* Country Filter Active Indicator */}
        {selectedCountryCode && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200">
            <Globe className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              Filtering by country: <strong>{selectedCountryCode}</strong>
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="ml-auto h-6 px-2"
              onClick={() => setSelectedCountryCode(null)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Interactive Status Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Overdue Summary Tile */}
          <Card className="border-destructive/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Payments Overdue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2 mb-4">
                <p className="text-3xl font-bold text-destructive">{overdueStats.total}</p>
                <p className="text-sm text-muted-foreground">accounts</p>
                <p className="text-lg font-semibold text-destructive ml-auto">
                  {formatCurrency(overdueStats.totalAmount)}
                </p>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[3, 7, 14, 30, 90].map((days) => (
                  <Button
                    key={days}
                    variant={paymentStatusFilter === `overdue_${days}` ? "default" : "outline"}
                    size="sm"
                    className={`text-xs flex-col h-auto py-2 ${paymentStatusFilter === `overdue_${days}` ? 'bg-destructive' : 'border-destructive/30 hover:bg-destructive/10'}`}
                    onClick={() => applyQuickFilter('overdue', days)}
                  >
                    <span className="text-lg font-bold">{overdueStats.byDays[days as keyof typeof overdueStats.byDays]}</span>
                    <span className="text-[10px]">{days}+ days</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Prepaid Summary Tile */}
          <Card className="border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                Payments Ahead
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2 mb-4">
                <p className="text-3xl font-bold text-green-600">{prepaidStats.total}</p>
                <p className="text-sm text-muted-foreground">accounts</p>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[3, 7, 14, 30, 90].map((days) => (
                  <Button
                    key={days}
                    variant={paymentStatusFilter === `prepaid_${days}` ? "default" : "outline"}
                    size="sm"
                    className={`text-xs flex-col h-auto py-2 ${paymentStatusFilter === `prepaid_${days}` ? 'bg-green-600' : 'border-green-300 hover:bg-green-50'}`}
                    onClick={() => applyQuickFilter('prepaid', days)}
                  >
                    <span className="text-lg font-bold">{prepaidStats.byDays[days as keyof typeof prepaidStats.byDays]}</span>
                    <span className="text-[10px]">{days}+ days</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Registration Statistics */}
        {registrationStats && (
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" />
                  Customer Registration Statistics
                </CardTitle>
                {registrationStats.unregisteredList?.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowUnregisteredList(!showUnregisteredList)}
                  >
                    {showUnregisteredList ? 'Hide' : 'Show'} Unregistered ({registrationStats.unregisteredCustomers})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Total Customers</p>
                  <p className="text-2xl font-bold">{registrationStats.totalCustomers}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Registered</p>
                  <p className="text-2xl font-bold text-green-600">{registrationStats.registeredCustomers}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Not Registered</p>
                  <p className="text-2xl font-bold text-destructive">{registrationStats.unregisteredCustomers}</p>
                </div>
                <div className="bg-primary/10 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Registration Rate</p>
                  <p className="text-2xl font-bold text-primary">{registrationStats.registrationPercentage}%</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Registration Progress</span>
                  <span className="font-medium">{registrationStats.registrationPercentage}% Complete</span>
                </div>
                <Progress value={registrationStats.registrationPercentage} className="h-3" />
              </div>

              {registrationStats.byCategory?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-3">Registration by Category</h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={registrationStats.byCategory.slice(0, 8)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="category" type="category" width={120} tick={{ fontSize: 12 }} />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-background border rounded-lg p-3 shadow-lg">
                                  <p className="font-medium">{data.category}</p>
                                  <p className="text-sm text-green-600">Registered: {data.registered}</p>
                                  <p className="text-sm text-destructive">Not Registered: {data.unregistered}</p>
                                  <p className="text-sm text-muted-foreground">Rate: {data.percentage}%</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="registered" stackId="a" fill="#22c55e" name="Registered" />
                        <Bar dataKey="unregistered" stackId="a" fill="#ef4444" name="Not Registered" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {showUnregisteredList && registrationStats.unregisteredList?.length > 0 && (
                <div className="border rounded-lg">
                  <div className="bg-muted/50 px-4 py-2 border-b">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <UserX className="h-4 w-4 text-destructive" />
                      Unregistered Customers ({registrationStats.unregisteredList.length})
                    </h4>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Stand</TableHead>
                          <TableHead>Customer Name</TableHead>
                          <TableHead>Category</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {registrationStats.unregisteredList.slice(0, 50).map((customer: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-sm">{customer.standNumber}</TableCell>
                            <TableCell>{customer.customerName}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{customer.category}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {registrationStats.unregisteredList.length > 50 && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        Showing first 50 of {registrationStats.unregisteredList.length} unregistered customers
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Monthly Collection Tiles with Year */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {last3MonthsDisplay.map((monthData: any, idx: number) => {
            const collectionRate = monthData.expected > 0 
              ? ((monthData.received / monthData.expected) * 100).toFixed(1)
              : '0';
            
            return (
              <Card key={idx} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {monthData.fullLabel}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">Collected</span>
                      <span className="text-xl font-bold text-green-600">{formatCurrency(monthData.received)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">Expected</span>
                      <span className="text-sm text-muted-foreground">{formatCurrency(monthData.expected)}</span>
                    </div>
                    <Progress value={parseFloat(collectionRate)} className="h-2" />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{collectionRate}% collected</span>
                      {monthData.delta !== null && (
                        <span className={monthData.delta >= 0 ? 'text-green-600' : 'text-destructive'}>
                          {monthData.delta >= 0 ? '+' : ''}{formatCurrency(monthData.delta)} vs {monthData.previousMonthName}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Category Trends */}
        {categoryTrends.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Collections by Customer Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {categoryTrends.slice(0, 8).map((cat: any) => (
                  <div 
                    key={cat.category} 
                    className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => applyCategoryFilter(cat.category)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium truncate">{cat.category}</span>
                        <Badge variant="outline" className="ml-2">{cat.count} stands</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-green-600">Collected: {formatCurrency(cat.received)}</span>
                        <span className="text-muted-foreground">Outstanding: {formatCurrency(cat.outstanding)}</span>
                      </div>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <p className="text-lg font-bold">{cat.collectionRate}%</p>
                      <p className="text-xs text-muted-foreground">Rate</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly Collections Trend with Year Filter */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Monthly Collections: Forecast vs Collected vs Trend</CardTitle>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {monthlyChartData.length === 0 ? (
              <div className="h-80 flex items-center justify-center border-2 border-dashed border-muted rounded-lg">
                <div className="text-center text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No payment data available</p>
                  <p className="text-sm mt-1">
                    {selectedYear !== "all" 
                      ? `No payments recorded for ${selectedYear}. Try selecting "All Years".`
                      : "Payment data will appear here once transactions are recorded."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} />
                    <Tooltip 
                      formatter={(value: number, name: string) => {
                        if (name === 'Trend') return [`${value.toFixed(1)}%`, name];
                        return [formatCurrency(value), name];
                      }}
                      labelFormatter={(label) => {
                        const item = monthlyChartData.find(d => d.month === label);
                        return item?.fullMonth || label;
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="expected" fill="#94a3b8" name="Forecast" radius={[4, 4, 0, 0]} opacity={0.6} />
                    <Bar yAxisId="left" dataKey="received" fill="#22c55e" name="Collected" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="trend" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="Trend" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Performance Chart - Collection Rate as % of Expected */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Collection Rate (% of Expected)</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyChartData.length === 0 ? (
              <div className="h-80 flex items-center justify-center border-2 border-dashed border-muted rounded-lg">
                <div className="text-center text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No collection data available</p>
                  <p className="text-sm mt-1">Collection rate will appear here once payments are recorded.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={monthlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 'auto']} tickFormatter={(v) => `${v}%`} />
                      <Tooltip 
                        formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
                        labelFormatter={(label) => {
                          const item = monthlyChartData.find(d => d.month === label);
                          return item?.fullMonth || label;
                        }}
                      />
                      <Legend />
                      <Bar 
                        dataKey="percentage" 
                        name="Collection Rate" 
                        radius={[4, 4, 0, 0]}
                        fill="#3b82f6"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="trend" 
                        stroke="#f97316" 
                        strokeWidth={2} 
                        dot={{ r: 3, fill: '#f97316' }} 
                        name="3-Month Trend"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-6 mt-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-[#3b82f6]" />
                    <span>Actual collection % of expected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-[#f97316]" />
                    <span>Rolling 3-month trend</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 border-t-2 border-dashed border-muted-foreground" />
                    <span>100% = On target</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Stands Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>All Stands Overview ({soldStands.length})</CardTitle>
              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stand</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Monthly Payment</TableHead>
                    <TableHead>Total Paid</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soldStands.slice(0, 50).map((stand: any) => (
                    <TableRow key={stand.standNumber}>
                      <TableCell className="font-medium">{stand.standNumber}</TableCell>
                      <TableCell>{stand.customerName}</TableCell>
                      <TableCell>
                        {stand.countryCode ? (
                          <Badge 
                            variant="outline" 
                            className="text-xs cursor-pointer hover:bg-muted"
                            onClick={() => applyCountryFilter(stand.countryCode)}
                          >
                            {stand.countryCode}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{stand.customerCategory || '-'}</Badge>
                      </TableCell>
                      <TableCell>{stand.monthlyPayment}</TableCell>
                      <TableCell className="text-green-600">{stand.totalPaid}</TableCell>
                      <TableCell className="text-destructive">{stand.currentBalance}</TableCell>
                      <TableCell className="text-green-600">{stand.totalPaid}</TableCell>
                      <TableCell className="text-destructive">{stand.currentBalance}</TableCell>
                      <TableCell>
                        <Badge variant={stand.progressPercentage > 75 ? "default" : stand.progressPercentage > 50 ? "secondary" : "destructive"}>
                          {stand.progressPercentage}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {stand.daysOverdue > 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            {stand.daysOverdue}d overdue
                          </Badge>
                        ) : stand.prepaidDays > 0 ? (
                          <Badge variant="default" className="bg-green-600 text-xs">
                            {stand.prepaidDays}d prepaid
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Current</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedStand(stand)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {soldStands.length > 50 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Showing first 50 of {soldStands.length} stands. Use filters to narrow results.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Unsold Stands */}
        {unsoldStands.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Unsold Stands ({unsoldStands.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {unsoldStands.map((stand: any) => (
                  <Badge key={stand.standNumber} variant="outline">
                    Stand {stand.standNumber}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stand Details Modal */}
      <Dialog open={!!selectedStand} onOpenChange={() => setSelectedStand(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Stand {selectedStand?.standNumber} - {selectedStand?.customerName}
            </DialogTitle>
          </DialogHeader>
          {selectedStand && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Price</p>
                  <p className="text-lg font-semibold">{selectedStand.totalPrice}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Paid</p>
                  <p className="text-lg font-semibold text-green-600">{selectedStand.totalPaid}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Balance</p>
                  <p className="text-lg font-semibold text-destructive">{selectedStand.currentBalance}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Progress</p>
                  <p className="text-lg font-semibold">{selectedStand.progressPercentage}%</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium">{selectedStand.customerCategory || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Payment</p>
                  <p className="font-medium">{selectedStand.monthlyPayment}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Payment History</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedStand.payments.map((payment: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell>{payment.month}</TableCell>
                        <TableCell className="text-green-600">{payment.amount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default Reporting;
