import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Users, Home } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";
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
  const [reportingData, setReportingData] = useState<any>(null);
  const [selectedStand, setSelectedStand] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState<any>(null);

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

  const { stands, summary, monthlyTotals, monthColumns } = reportingData;
  const soldStands = stands.filter((s: any) => !s.isUnsold);
  const unsoldStands = stands.filter((s: any) => s.isUnsold);

  // Prepare chart data
  const monthlyChartData = monthlyTotals.map((m: any) => ({
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
      
      // Find matching data from monthlyTotals
      const monthData = monthlyTotals.find((m: any) => {
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
          <div className="flex gap-2">
            {isSuperAdmin && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("/account-management")}
              >
                Manage Access
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/")}
              className="text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/10"
            >
              <Home className="h-4 w-4 mr-2" />
              Home
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Expected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <p className="text-xl md:text-2xl font-bold">{summary.totalExpected}</p>
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
                <p className="text-xl md:text-2xl font-bold text-green-600">{summary.totalReceived}</p>
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
                <p className="text-xl md:text-2xl font-bold text-red-600">{summary.totalOutstanding}</p>
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
                <p className="text-xl md:text-2xl font-bold">{summary.collectionPercentage}%</p>
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
            <CardTitle>All Stands Overview</CardTitle>
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
