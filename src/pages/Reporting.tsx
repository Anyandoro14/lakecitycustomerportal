import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Users, Filter, X, Download } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import InternalNav from "@/components/InternalNav";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

const Reporting = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isDirector, setIsDirector] = useState(false);
  const [reportingData, setReportingData] = useState<any>(null);
  const [selectedStand, setSelectedStand] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedPriceRanges, setSelectedPriceRanges] = useState<string[]>([]);
  const [filterOfferReceived, setFilterOfferReceived] = useState<boolean | null>(null);
  const [filterInitialPayment, setFilterInitialPayment] = useState<boolean | null>(null);
  const [filterAgreementRequested, setFilterAgreementRequested] = useState<boolean | null>(null);
  const [filterAgreementSignedWarwickshire, setFilterAgreementSignedWarwickshire] = useState<boolean | null>(null);
  const [filterAgreementSignedClient, setFilterAgreementSignedClient] = useState<boolean | null>(null);
  
  // Payment status filter
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string | null>(null);

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
      await fetchReportingData();
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

  // Price range definitions
  const priceRanges = [
    { label: "$10,000 - $15,000", min: 10000, max: 15000 },
    { label: "$15,001 - $25,000", min: 15001, max: 25000 },
    { label: "$25,001 - $50,000", min: 25001, max: 50000 },
    { label: "$50,001 - $75,000", min: 50001, max: 75000 },
    { label: "$75,001 - $100,000", min: 75001, max: 100000 },
    { label: "$100,001+", min: 100001, max: Infinity },
  ];
  
  // Payment status filter options
  const paymentStatusOptions = [
    { label: "All Overdue", value: "overdue_any", minDays: 1, maxDays: Infinity, type: "overdue" },
    { label: "Overdue 3+ days", value: "overdue_3", minDays: 3, maxDays: Infinity, type: "overdue" },
    { label: "Overdue 7+ days", value: "overdue_7", minDays: 7, maxDays: Infinity, type: "overdue" },
    { label: "Overdue 14+ days", value: "overdue_14", minDays: 14, maxDays: Infinity, type: "overdue" },
    { label: "Overdue 21+ days", value: "overdue_21", minDays: 21, maxDays: Infinity, type: "overdue" },
    { label: "Overdue 30+ days", value: "overdue_30", minDays: 30, maxDays: Infinity, type: "overdue" },
    { label: "Overdue 90+ days", value: "overdue_90", minDays: 90, maxDays: Infinity, type: "overdue" },
    { label: "Overdue 180+ days", value: "overdue_180", minDays: 180, maxDays: Infinity, type: "overdue" },
    { label: "Prepaid 3+ days", value: "prepaid_3", minDays: 3, maxDays: Infinity, type: "prepaid" },
    { label: "Prepaid 7+ days", value: "prepaid_7", minDays: 7, maxDays: Infinity, type: "prepaid" },
    { label: "Prepaid 14+ days", value: "prepaid_14", minDays: 14, maxDays: Infinity, type: "prepaid" },
    { label: "Prepaid 21+ days", value: "prepaid_21", minDays: 21, maxDays: Infinity, type: "prepaid" },
    { label: "Prepaid 30+ days", value: "prepaid_30", minDays: 30, maxDays: Infinity, type: "prepaid" },
    { label: "Prepaid 90+ days", value: "prepaid_90", minDays: 90, maxDays: Infinity, type: "prepaid" },
    { label: "Prepaid 180+ days", value: "prepaid_180", minDays: 180, maxDays: Infinity, type: "prepaid" },
  ];
  
  // Get unique customer categories - safe to call even when reportingData is null
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
  
  // Apply filters - safe to call even when reportingData is null
  const filteredStands = useMemo(() => {
    if (!reportingData?.stands) return [];
    
    return reportingData.stands.filter((stand: any) => {
      // Skip unsold stands from filtering
      if (stand.isUnsold) return true;
      
      // Category filter
      if (selectedCategories.length > 0) {
        if (!selectedCategories.includes(stand.customerCategory)) return false;
      }
      
      // Price range filter
      if (selectedPriceRanges.length > 0) {
        const inRange = selectedPriceRanges.some(rangeLabel => {
          const range = priceRanges.find(r => r.label === rangeLabel);
          if (!range) return false;
          return stand.priceNumeric >= range.min && stand.priceNumeric <= range.max;
        });
        if (!inRange) return false;
      }
      
      // Boolean filters
      if (filterOfferReceived !== null && stand.offerReceived !== filterOfferReceived) return false;
      if (filterInitialPayment !== null && stand.initialPaymentCompleted !== filterInitialPayment) return false;
      if (filterAgreementRequested !== null && stand.agreementRequested !== filterAgreementRequested) return false;
      if (filterAgreementSignedWarwickshire !== null && stand.agreementSignedWarwickshire !== filterAgreementSignedWarwickshire) return false;
      if (filterAgreementSignedClient !== null && stand.agreementSignedClient !== filterAgreementSignedClient) return false;
      
      // Payment status filter (overdue/prepaid)
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
  
  // Log filtering results for debugging
  console.log('Reporting filters:', {
    categories: selectedCategories,
    priceRanges: selectedPriceRanges.length,
    offerReceived: filterOfferReceived,
    initialPayment: filterInitialPayment,
    agreementRequested: filterAgreementRequested,
    agreementSignedW: filterAgreementSignedWarwickshire,
    agreementSignedC: filterAgreementSignedClient,
    totalStands: reportingData?.stands?.length || 0,
    filteredCount: filteredStands.length,
    soldCount: soldStands.length
  });
  
  // Log filtering results for debugging
  console.log('Reporting filters:', {
    categories: selectedCategories,
    priceRanges: selectedPriceRanges.length,
    offerReceived: filterOfferReceived,
    initialPayment: filterInitialPayment,
    agreementRequested: filterAgreementRequested,
    agreementSignedW: filterAgreementSignedWarwickshire,
    agreementSignedC: filterAgreementSignedClient,
    totalStands: reportingData?.stands?.length || 0,
    filteredStands: filteredStands.length,
    soldStands: soldStands.length
  });
  
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
      totalExpected: `$${totalExpected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      totalReceived: `$${totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      totalOutstanding: `$${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      collectionPercentage: totalExpected > 0 ? ((totalReceived / totalExpected) * 100).toFixed(2) : '0',
    };
  }, [soldStands]);
  
  // Recalculate monthly totals based on filtered stands
  const filteredMonthlyTotals = useMemo(() => {
    const monthlyData: { [month: string]: { expected: number; received: number; count: number } } = {};
    
    soldStands.forEach((stand: any) => {
      const monthlyPaymentAmount = parseFloat(stand.monthlyPayment.replace(/[$,]/g, '')) || 0;
      
      stand.payments.forEach((payment: any) => {
        if (!monthlyData[payment.month]) {
          monthlyData[payment.month] = { expected: 0, received: 0, count: 0 };
        }
        monthlyData[payment.month].received += payment.amountNumeric;
        monthlyData[payment.month].expected += monthlyPaymentAmount;
        monthlyData[payment.month].count += 1;
      });
    });
    
    return Object.entries(monthlyData).map(([month, data]) => ({
      month,
      expected: data.expected,
      received: data.received,
      percentage: data.expected > 0 ? ((data.received / data.expected) * 100).toFixed(2) : '0',
      count: data.count
    }));
  }, [soldStands]);
  
  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedPriceRanges([]);
    setFilterOfferReceived(null);
    setFilterInitialPayment(null);
    setFilterAgreementRequested(null);
    setFilterAgreementSignedWarwickshire(null);
    setFilterAgreementSignedClient(null);
    setPaymentStatusFilter(null);
  };
  
  const hasActiveFilters = selectedCategories.length > 0 || selectedPriceRanges.length > 0 || 
    filterOfferReceived !== null || filterInitialPayment !== null || 
    filterAgreementRequested !== null || filterAgreementSignedWarwickshire !== null || 
    filterAgreementSignedClient !== null || paymentStatusFilter !== null;

  const exportToCSV = () => {
    const headers = ['Stand', 'Customer', 'Category', 'Total Price', 'Monthly Payment', 'Total Paid', 'Balance', 'Progress %', 'Days Overdue', 'Days Prepaid'];
    const rows = soldStands.map((stand: any) => [
      stand.standNumber,
      stand.customerName,
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

  const { monthlyTotals, monthColumns } = reportingData;

  // Prepare chart data from filtered monthly totals
  const monthlyChartData = filteredMonthlyTotals.map((m: any) => ({
    month: m.month.split(' ')[1], // Extract month name
    expected: m.expected,
    received: m.received,
    percentage: parseFloat(m.percentage)
  }));

  // Get current month and 2 previous months based on today's date
  const today = new Date();
  const getLast3Months = () => {
    const months = [];
    for (let i = 0; i < 4; i++) { // Get 4 months to calculate deltas
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthName = date.toLocaleDateString('en-US', { month: 'long' });
      const year = date.getFullYear();
      
      // Find matching data from filteredMonthlyTotals
      const monthData = filteredMonthlyTotals.find((m: any) => {
        const dataMonth = m.month.split(' ')[1];
        const dataYear = m.month.split(' ')[2];
        return dataMonth === monthName && dataYear === year.toString();
      });
      
      months.push({
        month: `${monthName} ${year}`,
        received: monthData ? monthData.received : 0
      });
    }
    return months;
  };
  
  const last4Months = getLast3Months();
  const last3Months = last4Months.slice(0, 3).map((month: any, idx: number) => {
    const previousMonth = last4Months[idx + 1];
    const delta = previousMonth ? month.received - previousMonth.received : null;
    return {
      ...month,
      delta,
      previousMonthName: previousMonth ? previousMonth.month.split(' ')[0] : null
    };
  }).reverse(); // Reverse to show chronologically from oldest to newest

  const COLORS = ['#10b981', '#ef4444', '#f59e0b'];

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
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {paymentStatusOptions.map((option) => (
                    <Button
                      key={option.value}
                      variant={paymentStatusFilter === option.value ? "default" : "outline"}
                      size="sm"
                      className={`text-xs ${option.type === 'overdue' ? 'border-red-200 hover:border-red-400' : 'border-green-200 hover:border-green-400'} ${paymentStatusFilter === option.value ? (option.type === 'overdue' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700') : ''}`}
                      onClick={() => setPaymentStatusFilter(paymentStatusFilter === option.value ? null : option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
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
        
        {/* Summary Cards */}
        {soldStands.length === 0 && hasActiveFilters && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-yellow-800 font-medium">No stands match your current filters</p>
            <p className="text-yellow-700 text-sm mt-1">
              Try clearing some filters, especially the Agreement Status filters. When all status filters are set to "Yes", 
              only stands with ALL statuses checked will be included.
            </p>
          </div>
        )}
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Expected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <p className="text-xl md:text-2xl font-bold">{filteredSummary.totalExpected}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Received</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <p className="text-xl md:text-2xl font-bold text-green-600">{filteredSummary.totalReceived}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600" />
                <p className="text-xl md:text-2xl font-bold text-red-600">{filteredSummary.totalOutstanding}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Collection Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <p className="text-xl md:text-2xl font-bold">{filteredSummary.collectionPercentage}%</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Collection Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {last3Months.map((monthData: any, idx: number) => {
            const formattedAmount = `$${monthData.received.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const currentMonthName = monthData.month.split(' ')[0];
            
            return (
              <Card key={idx}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Collected in {monthData.month}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <p className="text-xl md:text-2xl font-bold text-green-600">{formattedAmount}</p>
                  </div>
                  {monthData.delta !== null && (
                    <p className={`text-xs ${monthData.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${Math.abs(monthData.delta).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {monthData.delta >= 0 ? 'increase' : 'decrease'} from {monthData.previousMonthName}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Monthly Collections Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Collections Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="expected" stroke="#94a3b8" strokeWidth={2} name="Expected" />
                  <Line type="monotone" dataKey="received" stroke="#10b981" strokeWidth={2} name="Received" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Performance Bars */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Collection Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="percentage" fill="#10b981" name="Collection %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Stands Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>All Stands Overview</CardTitle>
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
                    <TableHead>Monthly Payment</TableHead>
                    <TableHead>Total Paid</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soldStands.map((stand: any) => (
                    <TableRow key={stand.standNumber}>
                      <TableCell className="font-medium">{stand.standNumber}</TableCell>
                      <TableCell>{stand.customerName}</TableCell>
                      <TableCell>{stand.monthlyPayment}</TableCell>
                      <TableCell className="text-green-600">{stand.totalPaid}</TableCell>
                      <TableCell className="text-red-600">{stand.currentBalance}</TableCell>
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
              <div className="grid grid-cols-2 gap-4">
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
                  <p className="text-lg font-semibold text-red-600">{selectedStand.currentBalance}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Progress</p>
                  <p className="text-lg font-semibold">{selectedStand.progressPercentage}%</p>
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
