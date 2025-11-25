import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Home, 
  FileText, 
  DollarSign, 
  BarChart3, 
  Settings, 
  Database,
  ArrowRight,
  CheckCircle2,
  Users,
  Calendar,
  TrendingUp,
  Shield,
  Eye,
  Edit,
  Download,
  ArrowDown,
  ArrowUp
} from "lucide-react";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import homeDashboard from "@/assets/guide/home-dashboard.png";
import paymentHistory from "@/assets/guide/payment-history.png";
import agreementOfSale from "@/assets/guide/agreement-of-sale.png";
import documentsList from "@/assets/guide/documents-list.png";
import monthlyStatements from "@/assets/guide/monthly-statements.png";
import statementHeader from "@/assets/guide/statement-header.png";
import statementSummary from "@/assets/guide/statement-summary.png";
import statementHistoryImg from "@/assets/guide/statement-history.png";

const Guide = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <CustomerHeader />
      
      <main className="pb-20 pt-4 px-4 max-w-4xl mx-auto">
        {/* Hero Section */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-foreground mb-3">
            Customer Portal Guide
          </h1>
          <p className="text-lg text-muted-foreground">
            Your comprehensive guide to managing your property investment
          </p>
        </div>

        {/* Table of Contents */}
        <Card className="p-6 mb-8 bg-gradient-to-br from-primary/10 to-accent/10 border-2">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            Quick Navigation
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button 
              variant="outline" 
              className="justify-start" 
              onClick={() => document.getElementById('home')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Home className="h-4 w-4 mr-2" />
              Home Dashboard
            </Button>
            <Button 
              variant="outline" 
              className="justify-start"
              onClick={() => document.getElementById('agreement')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <FileText className="h-4 w-4 mr-2" />
              Agreement of Sale
            </Button>
            <Button 
              variant="outline" 
              className="justify-start"
              onClick={() => document.getElementById('statements')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Monthly Statements
            </Button>
            <Button 
              variant="outline" 
              className="justify-start"
              onClick={() => document.getElementById('reporting')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Reporting Dashboard
            </Button>
            <Button 
              variant="outline" 
              className="justify-start"
              onClick={() => document.getElementById('account')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Settings className="h-4 w-4 mr-2" />
              Account Management
            </Button>
            <Button 
              variant="outline" 
              className="justify-start"
              onClick={() => document.getElementById('sheets')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Database className="h-4 w-4 mr-2" />
              Google Sheets Integration
            </Button>
          </div>
        </Card>

        {/* Home Dashboard Section */}
        <section id="home" className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Home className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="text-3xl font-bold">Home Dashboard</h2>
          </div>
          
          <Card className="p-6 mb-4">
            <h3 className="text-xl font-semibold mb-3 text-primary">Overview</h3>
            <p className="text-muted-foreground mb-4">
              The Home Dashboard is your central hub for monitoring your property investment. It provides a comprehensive 
              overview of your payment status, account balance, and important documents.
            </p>

            {/* Example Image */}
            <div className="my-6 border-4 border-primary/30 rounded-lg overflow-hidden shadow-lg">
              <div className="relative">
                <img 
                  src={homeDashboard} 
                  alt="Home Dashboard Example"
                  className="w-full"
                />
                {/* Annotation arrows */}
                <div className="absolute top-4 right-4 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <ArrowDown className="h-3 w-3" />
                  Stand Selector
                </div>
                <div className="absolute top-[30%] left-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  Payment Progress
                  <ArrowRight className="h-3 w-3" />
                </div>
                <div className="absolute bottom-[15%] right-4 bg-purple-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <ArrowUp className="h-3 w-3" />
                  Quick Actions
                </div>
              </div>
              <div className="bg-gradient-to-r from-primary/10 to-accent/10 p-3 text-sm text-center">
                <Badge variant="outline" className="text-xs font-semibold">Example: Stand 55555 - AlexTEST Nyandoro</Badge>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-3 items-start">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Customer Overview</h4>
                  <p className="text-sm text-muted-foreground">
                    Displays your name and stand number. If you own multiple stands, use the dropdown to switch between them.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Payment Progress Bar</h4>
                  <p className="text-sm text-muted-foreground">
                    Visual representation of your payment completion percentage (e.g., 46% for Stand 55555).
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Last Payment & Next Payment Due</h4>
                  <p className="text-sm text-muted-foreground">
                    Shows your most recent payment details and upcoming payment due on the 5th of each month. 
                    Overdue payments appear in red with days past due.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Current Balance & Total Paid</h4>
                  <p className="text-sm text-muted-foreground">
                    Track your remaining balance and total amount paid to date.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Payment History</h4>
                  <p className="text-sm text-muted-foreground">
                    Expandable list showing all your historical payments with breakdown of principal, interest, and VAT.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-blue-50 border-blue-200">
            <p className="text-sm text-blue-900">
              <strong>💡 Pro Tip:</strong> Use the "Refresh Data" button to sync the latest information from your account.
            </p>
          </Card>
        </section>

        <Separator className="my-8" />

        {/* Agreement of Sale Section */}
        <section id="agreement" className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
            <h2 className="text-3xl font-bold">Agreement of Sale</h2>
          </div>
          
          <Card className="p-6 mb-4">
            <h3 className="text-xl font-semibold mb-3 text-primary">Document Management</h3>
            <p className="text-muted-foreground mb-4">
              This page tracks the signing status and provides access to all versions of your Agreement of Sale documents.
            </p>

            {/* Agreement of Sale Screenshot */}
            <div className="my-6 border-4 border-purple-500/30 rounded-lg overflow-hidden shadow-lg">
              <div className="relative">
                <img 
                  src={agreementOfSale} 
                  alt="Agreement of Sale Page"
                  className="w-full"
                />
                <div className="absolute top-4 right-4 bg-purple-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <ArrowDown className="h-3 w-3" />
                  Status Indicators
                </div>
                <div className="absolute bottom-[35%] left-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  Document Versions
                  <ArrowRight className="h-3 w-3" />
                </div>
              </div>
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-3 text-sm text-center">
                <Badge variant="outline" className="text-xs font-semibold">Agreement of Sale Page Overview</Badge>
              </div>
            </div>

            {/* Documents List Screenshot */}
            <div className="my-6 border-4 border-green-500/30 rounded-lg overflow-hidden shadow-lg">
              <div className="relative">
                <img 
                  src={documentsList} 
                  alt="Documents List"
                  className="w-full"
                />
                <div className="absolute top-[15%] right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Signed Status
                </div>
                <div className="absolute bottom-[40%] left-4 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  Download Options
                  <ArrowRight className="h-3 w-3" />
                </div>
              </div>
              <div className="bg-gradient-to-r from-green-50 to-teal-50 p-3 text-sm text-center">
                <Badge variant="outline" className="text-xs font-semibold">Document List with Status</Badge>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Eye className="h-4 w-4 text-purple-600" />
                  Status Indicators
                </h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Signed by Seller - Agreement signed by Lakecity</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Signed by Buyer - Agreement signed by you</span>
                  </li>
                </ul>
              </div>

              <div className="p-4 bg-gradient-to-r from-green-50 to-teal-50 rounded-lg border border-green-200">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Download className="h-4 w-4 text-green-600" />
                  Available Documents
                </h4>
                <ul className="space-y-2 text-sm">
                  <li>• <strong>Agreement of Sale - Original:</strong> The initial unsigned agreement</li>
                  <li>• <strong>Agreement of Sale - Signed by Seller:</strong> After Lakecity signs</li>
                  <li>• <strong>Agreement of Sale - Fully Executed:</strong> Final version with both signatures</li>
                </ul>
              </div>
            </div>

            <Button 
              onClick={() => navigate('/agreement-of-sale')} 
              className="w-full"
            >
              View Agreement Documents <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        </section>

        <Separator className="my-8" />

        {/* Monthly Statements Section */}
        <section id="statements" className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold">Monthly Statements</h2>
          </div>
          
          <Card className="p-6 mb-4">
            <h3 className="text-xl font-semibold mb-3 text-primary">Automated Financial Reporting</h3>
            <p className="text-muted-foreground mb-4">
              Monthly statements are automatically generated on the 1st of every month, providing you with a 
              professional financial summary of your account.
            </p>

            {/* Monthly Statements Page Screenshot */}
            <div className="my-6 border-4 border-green-500/30 rounded-lg overflow-hidden shadow-lg">
              <div className="relative">
                <img 
                  src={monthlyStatements} 
                  alt="Monthly Statements Page"
                  className="w-full"
                />
                <div className="absolute top-[20%] right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Auto-Generated
                </div>
                <div className="absolute bottom-4 left-4 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  Access Statements
                  <ArrowRight className="h-3 w-3" />
                </div>
              </div>
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 text-sm text-center">
                <Badge variant="outline" className="text-xs font-semibold">Monthly Statements Page</Badge>
              </div>
            </div>

            {/* Statement Header Screenshot */}
            <div className="my-6 border-4 border-blue-500/30 rounded-lg overflow-hidden shadow-lg">
              <div className="relative">
                <img 
                  src={statementHeader} 
                  alt="Statement Header"
                  className="w-full"
                />
                <div className="absolute top-4 right-4 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <ArrowDown className="h-3 w-3" />
                  Statement Date
                </div>
                <div className="absolute bottom-[20%] left-4 bg-purple-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  Customer Info
                  <ArrowRight className="h-3 w-3" />
                </div>
              </div>
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 text-sm text-center">
                <Badge variant="outline" className="text-xs font-semibold">Statement Header - Stand 55555</Badge>
              </div>
            </div>

            {/* Statement Summary Screenshot */}
            <div className="my-6 border-4 border-orange-500/30 rounded-lg overflow-hidden shadow-lg">
              <div className="relative">
                <img 
                  src={statementSummary} 
                  alt="Statement Summary"
                  className="w-full"
                />
                <div className="absolute top-[15%] left-4 bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  Purchase Price
                  <ArrowRight className="h-3 w-3" />
                </div>
                <div className="absolute top-[15%] right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <ArrowDown className="h-3 w-3" />
                  Total Paid
                </div>
                <div className="absolute bottom-[35%] left-4 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  Balance Due
                  <ArrowRight className="h-3 w-3" />
                </div>
                <div className="absolute bottom-[35%] right-4 bg-purple-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <ArrowDown className="h-3 w-3" />
                  Progress %
                </div>
              </div>
              <div className="bg-gradient-to-r from-orange-50 to-yellow-50 p-3 text-sm text-center">
                <Badge variant="outline" className="text-xs font-semibold">Account Summary Section</Badge>
              </div>
            </div>

            {/* Payment History Screenshot */}
            <div className="my-6 border-4 border-teal-500/30 rounded-lg overflow-hidden shadow-lg">
              <div className="relative">
                <img 
                  src={statementHistoryImg} 
                  alt="Payment History"
                  className="w-full"
                />
                <div className="absolute top-4 left-4 bg-teal-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  All Payments
                  <ArrowRight className="h-3 w-3" />
                </div>
                <div className="absolute bottom-[25%] right-4 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <Download className="h-3 w-3" />
                  Export Options
                </div>
              </div>
              <div className="bg-gradient-to-r from-teal-50 to-cyan-50 p-3 text-sm text-center">
                <Badge variant="outline" className="text-xs font-semibold">Payment History Detail</Badge>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-green-600" />
                  What's Included
                </h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Customer full name and stand number</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Total Paid amount as of statement date</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Days past due (if applicable)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Lakecity and Warwickshire branding</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Contact email: accounts@lakecity.co.zw</span>
                  </li>
                </ul>
              </div>

              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <h4 className="font-semibold mb-2 text-yellow-900">How It Works</h4>
                <ol className="space-y-2 text-sm text-yellow-900">
                  <li><strong>1.</strong> Statements generate automatically on the 1st of each month</li>
                  <li><strong>2.</strong> Real-time data is pulled from the Google Sheet</li>
                  <li><strong>3.</strong> Statements are stored and available for download anytime</li>
                  <li><strong>4.</strong> Each statement is dated and archived for your records</li>
                </ol>
              </div>
            </div>

            <Button 
              onClick={() => navigate('/monthly-statements')} 
              className="w-full mt-4"
            >
              View My Statements <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        </section>

        <Separator className="my-8" />

        {/* Reporting Dashboard Section */}
        <section id="reporting" className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <BarChart3 className="h-6 w-6 text-orange-600" />
            </div>
            <h2 className="text-3xl font-bold">Reporting Dashboard</h2>
            <Badge variant="secondary" className="ml-2">Admin Only</Badge>
          </div>
          
          <Card className="p-6 mb-4">
            <h3 className="text-xl font-semibold mb-3 text-primary">Financial Analytics for Directors</h3>
            <p className="text-muted-foreground mb-4">
              The Reporting Dashboard is a powerful analytics tool exclusively for directors and authorized staff. 
              It provides comprehensive insights into collections, payment trends, and account health.
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg border border-orange-200">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-orange-600" />
                  Key Metrics & Visualizations
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="p-3 bg-white rounded border">
                    <strong>Monthly Collection Tiles</strong>
                    <p className="text-muted-foreground text-xs mt-1">
                      Shows total collected for current month and 2 previous months, with month-over-month delta (e.g., "$156,582 increase from September")
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded border">
                    <strong>12-Month Trend Chart</strong>
                    <p className="text-muted-foreground text-xs mt-1">
                      Line/bar chart showing collections over time with expected vs actual amounts
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded border">
                    <strong>Completion Gauge</strong>
                    <p className="text-muted-foreground text-xs mt-1">
                      Visual gauge showing percentage of monthly collection target achieved
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded border">
                    <strong>Stands Overview Table</strong>
                    <p className="text-muted-foreground text-xs mt-1">
                      Expandable table with payment status highlighting for each stand
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded border">
                    <strong>Aging Analysis</strong>
                    <p className="text-muted-foreground text-xs mt-1">
                      Breakdown of accounts by age: 0-30 days, 31-60 days, 60+ overdue
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded border">
                    <strong>High-Risk Flags</strong>
                    <p className="text-muted-foreground text-xs mt-1">
                      Automatic alerts for accounts 2+ months behind
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-600" />
                  Data Sources
                </h4>
                <p className="text-sm text-muted-foreground">
                  All data is sourced exclusively from Google Sheets and automatically refreshes when the page loads. 
                  The dashboard includes 3-month forward projections and annual rolling totals.
                </p>
              </div>
            </div>

            <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
              <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Access Restricted
              </h4>
              <p className="text-sm text-red-900">
                Only authorized Super Admins and staff granted access via the Account Management page can view this dashboard.
              </p>
            </div>
          </Card>
        </section>

        <Separator className="my-8" />

        {/* Account Management Section */}
        <section id="account" className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <Settings className="h-6 w-6 text-red-600" />
            </div>
            <h2 className="text-3xl font-bold">Account Management</h2>
            <Badge variant="secondary" className="ml-2">Super Admin Only</Badge>
          </div>
          
          <Card className="p-6 mb-4">
            <h3 className="text-xl font-semibold mb-3 text-primary">Access Control Center</h3>
            <p className="text-muted-foreground mb-4">
              The Account Management page allows Super Admins to control which staff members can access the Reporting Dashboard.
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-red-50 to-pink-50 rounded-lg border border-red-200">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-red-600" />
                  Who Can Access
                </h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-red-600" />
                    <span><strong>Super Admins:</strong> alex@michaeltenable.com and alex@lakecity.co.zw</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Edit className="h-4 w-4 text-blue-600" />
                    <span><strong>Staff Users:</strong> Must be granted access by Super Admins</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-muted-foreground"><strong>Customers:</strong> Cannot be added to this system</span>
                  </li>
                </ul>
              </div>

              <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Database className="h-4 w-4 text-indigo-600" />
                  How It Works
                </h4>
                <ol className="space-y-2 text-sm">
                  <li><strong>1.</strong> Super Admins see an editable table with staff user information</li>
                  <li><strong>2.</strong> Table includes: Email Address, Full Name, Role (Admin/Viewer), Access to Reporting</li>
                  <li><strong>3.</strong> Toggle "Access to Reporting = Yes" to grant access to the Reporting Dashboard</li>
                  <li><strong>4.</strong> Toggle "Access to Reporting = No" to revoke access</li>
                  <li><strong>5.</strong> Changes sync to a separate Google Sheet for access control</li>
                  <li><strong>6.</strong> Access is verified instantly before loading Reporting page data</li>
                </ol>
              </div>

              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <h4 className="font-semibold mb-2 text-yellow-900">⚠️ Important Security Note</h4>
                <p className="text-sm text-yellow-900">
                  The Account Management system is separate from customer accounts. Only internal staff should be added here. 
                  Regular customers access their own data through the standard authentication system.
                </p>
              </div>
            </div>
          </Card>
        </section>

        <Separator className="my-8" />

        {/* Google Sheets Integration Section */}
        <section id="sheets" className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-teal-500/20 rounded-lg">
              <Database className="h-6 w-6 text-teal-600" />
            </div>
            <h2 className="text-3xl font-bold">Google Sheets Integration</h2>
          </div>
          
          <Card className="p-6 mb-4">
            <h3 className="text-xl font-semibold mb-3 text-primary">The Heart of the System</h3>
            <p className="text-muted-foreground mb-4">
              The entire Customer Portal is powered by Google Sheets as the single source of truth. 
              This ensures data consistency, easy management, and real-time updates.
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg border border-teal-200">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4 text-teal-600" />
                  Data Flow Architecture
                </h4>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="bg-teal-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</div>
                    <div>
                      <strong>Collection Schedule Sheet</strong>
                      <p className="text-muted-foreground text-xs">
                        Main sheet containing: Stand numbers, customer names, emails, payment schedules (36 monthly columns), 
                        total paid, current balance, and progress percentage
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="bg-teal-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">2</div>
                    <div>
                      <strong>Access Control Sheet</strong>
                      <p className="text-muted-foreground text-xs">
                        Separate sheet for staff access management: Email addresses, names, roles, and reporting access flags
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="bg-teal-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">3</div>
                    <div>
                      <strong>Authentication System</strong>
                      <p className="text-muted-foreground text-xs">
                        Users log in with their email, which is matched against the Google Sheet to authorize access to their stand(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="bg-teal-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">4</div>
                    <div>
                      <strong>Real-Time Sync</strong>
                      <p className="text-muted-foreground text-xs">
                        Portal fetches fresh data from Google Sheets every time a page loads or user clicks "Refresh Data"
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gradient-to-r from-blue-50 to-sky-50 rounded-lg border border-blue-200">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  Payment Tracking Logic
                </h4>
                <ul className="space-y-2 text-sm">
                  <li>• <strong>36 Monthly Columns (M-AV):</strong> Each column represents a monthly payment</li>
                  <li>• <strong>Fixed Due Date:</strong> All payments due on the 5th of each month</li>
                  <li>• <strong>Start Date:</strong> First payment date stored in the sheet</li>
                  <li>• <strong>Last Payment:</strong> Most recent filled cell in payment columns</li>
                  <li>• <strong>Next Payment:</strong> Next unfilled cell calculated from start date + months elapsed</li>
                  <li>• <strong>Overdue Detection:</strong> If next payment date &lt; today, display in red with days past due</li>
                  <li>• <strong>Total Paid:</strong> Column AX (sum of all payments)</li>
                  <li>• <strong>Current Balance:</strong> Column AY (remaining amount)</li>
                  <li>• <strong>Progress:</strong> Column AZ (percentage completion)</li>
                </ul>
              </div>

              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="font-semibold mb-2 text-green-900">✅ Benefits of Google Sheets Integration</h4>
                <ul className="space-y-1 text-sm text-green-900">
                  <li>✓ Single source of truth - no data duplication</li>
                  <li>✓ Easy to update by staff without technical knowledge</li>
                  <li>✓ Automatic calculations and formulas in the sheet</li>
                  <li>✓ No separate database to maintain</li>
                  <li>✓ Familiar interface for financial team</li>
                  <li>✓ Version history and audit trail built into Google Sheets</li>
                </ul>
              </div>
            </div>
          </Card>
        </section>

        {/* Example Workflow */}
        <Card className="p-6 bg-gradient-to-br from-primary/5 via-accent/5 to-secondary/5 border-2 border-primary/20">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Example: Customer Journey for Stand 55555
          </h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">1</div>
              <div>
                <strong>Login:</strong> Customer logs in with their email (e.g., alex@michaeltenable.com)
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">2</div>
              <div>
                <strong>Authorization:</strong> System checks Google Sheet and finds Stand 55555 associated with this email
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">3</div>
              <div>
                <strong>Dashboard Load:</strong> Shows payment progress (46%), total paid ($46,167), balance ($53,833)
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">4</div>
              <div>
                <strong>Payment History:</strong> Displays payment dated November 5, 2025 for $5,000
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">5</div>
              <div>
                <strong>Documents:</strong> Customer can view/download Agreement of Sale and Monthly Statements
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">6</div>
              <div>
                <strong>Monthly Refresh:</strong> On 1st of each month, new statement auto-generates with updated totals
              </div>
            </div>
          </div>
        </Card>

        {/* Quick Links */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button 
            size="lg" 
            onClick={() => navigate('/')}
            className="h-auto py-4"
          >
            <Home className="mr-2 h-5 w-5" />
            Go to Dashboard
          </Button>
          <Button 
            size="lg" 
            variant="outline"
            onClick={() => navigate('/settings')}
            className="h-auto py-4"
          >
            <Settings className="mr-2 h-5 w-5" />
            Account Settings
          </Button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Guide;
