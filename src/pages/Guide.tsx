import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Home, 
  FileText, 
  DollarSign, 
  ArrowRight,
  CheckCircle2,
  Calendar,
  Shield,
  Download,
  LogIn,
  UserPlus,
  KeyRound,
  LayoutDashboard,
  Receipt,
  CreditCard,
  Bell,
  HelpCircle,
  Smartphone,
  Monitor,
  Lock,
  Eye,
  ChevronRight,
  BookOpen,
  MessageCircle
} from "lucide-react";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import homeDashboard from "@/assets/guide/home-dashboard.png";
import paymentHistory from "@/assets/guide/payment-history.png";
import agreementOfSale from "@/assets/guide/agreement-of-sale.png";
import monthlyStatements from "@/assets/guide/monthly-statements.png";
import statementSummary from "@/assets/guide/statement-summary.png";

const Guide = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-24">
      <CustomerHeader />
      
      <main className="pt-4 px-4 max-w-4xl mx-auto">
        {/* Hero Section */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-3">
            <BookOpen className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl md:text-4xl font-bold text-foreground mb-2">
            Welcome to Your Owner Portal
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Your complete guide to managing your LakeCity property investment. 
            We're here to help you every step of the way.
          </p>
        </div>

        {/* Quick Navigation */}
        <Card className="p-4 md:p-6 mb-6 bg-gradient-to-br from-primary/10 to-accent/10 border-2">
          <h2 className="text-lg md:text-xl font-bold mb-3 flex items-center gap-2">
            <ChevronRight className="h-5 w-5 text-primary" />
            Quick Navigation
          </h2>
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <Button 
              variant="outline" 
              className="justify-start h-auto py-3 px-3 text-sm" 
              onClick={() => document.getElementById('accessing')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <LogIn className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="text-left truncate">Accessing</span>
            </Button>
            <Button 
              variant="outline" 
              className="justify-start h-auto py-3 px-3 text-sm"
              onClick={() => document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <LayoutDashboard className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="text-left truncate">Dashboard</span>
            </Button>
            <Button 
              variant="outline" 
              className="justify-start h-auto py-3 px-3 text-sm"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Eye className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="text-left truncate">Features</span>
            </Button>
            <Button 
              variant="outline" 
              className="justify-start h-auto py-3 px-3 text-sm"
              onClick={() => document.getElementById('support')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <HelpCircle className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="text-left truncate">Support</span>
            </Button>
          </div>
        </Card>

        {/* Section 1: Accessing the Portal */}
        <section id="accessing" className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/20 rounded-lg">
              <LogIn className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold">Accessing the Portal</h2>
          </div>
          
          <Card className="p-6 mb-4">
            <p className="text-muted-foreground mb-6">
              Getting started is easy. Follow these simple steps to access your personal dashboard.
            </p>

            <div className="space-y-4">
              {/* Step 1: Visit */}
              <div className="flex gap-4 items-start p-4 bg-muted/30 rounded-lg">
                <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold text-sm">
                  1
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-1">Visit the Portal</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Open your browser and go to:
                  </p>
                  <code className="bg-primary/10 text-primary px-3 py-1.5 rounded-md text-sm font-mono">
                    https://lakecity.standledger.io
                  </code>
                </div>
              </div>

              {/* Step 2: Sign Up */}
              <div className="flex gap-4 items-start p-4 bg-muted/30 rounded-lg">
                <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold text-sm">
                  2
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <UserPlus className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold">New Users: Sign Up</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    If you're new, click <strong>"Sign Up"</strong> and enter:
                  </p>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                      Your full name (as per your agreement)
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                      Your registered email address
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                      Create a secure password
                    </li>
                  </ul>
                </div>
              </div>

              {/* Step 3: Log In */}
              <div className="flex gap-4 items-start p-4 bg-muted/30 rounded-lg">
                <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold text-sm">
                  3
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <LogIn className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold">Returning Users: Log In</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Already have an account? Click <strong>"Log In"</strong> and enter your email and password.
                  </p>
                </div>
              </div>

              {/* Step 4: Forgot Password */}
              <div className="flex gap-4 items-start p-4 bg-muted/30 rounded-lg">
                <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold text-sm">
                  4
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold">Forgot Your Password?</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Click <strong>"Forgot Password"</strong> to reset it securely via email.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">💡 Tip:</strong> Use the same email address you provided when purchasing your property. 
                This ensures you can access your stand information.
              </p>
            </div>
          </Card>
        </section>

        <Separator className="my-8" />

        {/* Section 2: Dashboard Overview */}
        <section id="dashboard" className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/20 rounded-lg">
              <LayoutDashboard className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold">Dashboard Overview</h2>
          </div>
          
          <Card className="p-6 mb-4">
            <p className="text-muted-foreground mb-6">
              Once logged in, you'll land on your <strong>Personal Dashboard</strong> — your central hub for everything related to your property.
            </p>

            {/* Dashboard Screenshot */}
            <div className="my-6 border-4 border-primary/30 rounded-lg overflow-hidden shadow-lg">
              <img 
                src={homeDashboard} 
                alt="Personal Dashboard Overview"
                className="w-full"
              />
              <div className="bg-gradient-to-r from-primary/10 to-accent/10 p-3 text-sm text-center">
                <Badge variant="outline" className="text-xs font-semibold">Your Personal Dashboard</Badge>
              </div>
            </div>

            <h3 className="text-lg font-semibold mb-4 text-foreground">What You Can Do:</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex gap-3 items-start p-4 bg-muted/30 rounded-lg">
                <div className="p-2 bg-primary/20 rounded-lg flex-shrink-0">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">View Your Balance</h4>
                  <p className="text-xs text-muted-foreground">
                    See your current outstanding balance and payment progress
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start p-4 bg-muted/30 rounded-lg">
                <div className="p-2 bg-primary/20 rounded-lg flex-shrink-0">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Payment Progress</h4>
                  <p className="text-xs text-muted-foreground">
                    Track how far you are toward full ownership
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start p-4 bg-muted/30 rounded-lg">
                <div className="p-2 bg-primary/20 rounded-lg flex-shrink-0">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Download Monthly Statements</h4>
                  <p className="text-xs text-muted-foreground">
                    Access formal monthly statements for your records
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start p-4 bg-muted/30 rounded-lg">
                <div className="p-2 bg-primary/20 rounded-lg flex-shrink-0">
                  <Receipt className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">View Agreement of Sale</h4>
                  <p className="text-xs text-muted-foreground">
                    Access your signed Agreement of Sale documents
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <Separator className="my-8" />

        {/* Section 3: Key Features and Navigation */}
        <section id="features" className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Eye className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold">Key Features</h2>
          </div>

          {/* Feature: View Statements */}
          <Card className="p-6 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-secondary/30 rounded-lg">
                <Receipt className="h-5 w-5 text-secondary-foreground" />
              </div>
              <h3 className="text-xl font-semibold">🧾 Monthly Statements</h3>
            </div>
            
            <p className="text-muted-foreground mb-4">
              Navigate to the <strong>"Monthly Statements"</strong> section to access your formal financial records.
            </p>

            <div className="my-4 border-4 border-secondary/30 rounded-lg overflow-hidden shadow-lg">
              <img 
                src={monthlyStatements} 
                alt="Monthly Statements"
                className="w-full"
              />
              <div className="bg-gradient-to-r from-secondary/10 to-accent/10 p-3 text-sm text-center">
                <Badge variant="outline" className="text-xs font-semibold">Monthly Statements View</Badge>
              </div>
            </div>

            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>View your monthly statement showing opening balance, payments, and closing balance</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Statements are generated at the end of each month</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Download statements as PDF for your records</span>
              </li>
            </ul>

            <Button 
              onClick={() => navigate('/monthly-statements')} 
              className="w-full mt-4"
              variant="outline"
            >
              View My Statements <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>

          {/* Feature: View Signed Agreements */}
          <Card className="p-6 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-secondary/30 rounded-lg">
                <FileText className="h-5 w-5 text-secondary-foreground" />
              </div>
              <h3 className="text-xl font-semibold">📄 Agreement of Sale</h3>
            </div>
            
            <p className="text-muted-foreground mb-4">
              Go to <strong>"Agreement of Sale"</strong> to access your legal documents.
            </p>

            <div className="my-4 border-4 border-secondary/30 rounded-lg overflow-hidden shadow-lg">
              <img 
                src={agreementOfSale} 
                alt="Agreement of Sale Documents"
                className="w-full"
              />
              <div className="bg-gradient-to-r from-secondary/10 to-accent/10 p-3 text-sm text-center">
                <Badge variant="outline" className="text-xs font-semibold">Agreement Documents</Badge>
              </div>
            </div>

            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>View your signed Agreement of Sale</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Download as PDF for your records</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Track signing status (Seller signed, Buyer signed)</span>
              </li>
            </ul>

            <Button 
              onClick={() => navigate('/agreement-of-sale')} 
              className="w-full mt-4"
              variant="outline"
            >
              View Agreement Documents <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>

          {/* Feature: Track Your Payments */}
          <Card className="p-6 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-secondary/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-secondary-foreground" />
              </div>
              <h3 className="text-xl font-semibold">💵 Payment Summary</h3>
            </div>
            
            <p className="text-muted-foreground mb-4">
              The <strong>"Payment Summary"</strong> panel on your dashboard shows everything you need at a glance:
            </p>

            <div className="my-4 border-4 border-secondary/30 rounded-lg overflow-hidden shadow-lg">
              <img 
                src={statementSummary} 
                alt="Payment Summary"
                className="w-full"
              />
              <div className="bg-gradient-to-r from-secondary/10 to-accent/10 p-3 text-sm text-center">
                <Badge variant="outline" className="text-xs font-semibold">Payment Summary Panel</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="p-4 bg-muted/30 rounded-lg text-center">
                <p className="text-xs text-muted-foreground mb-1">Last Payment</p>
                <p className="font-semibold text-sm">Most recent amount paid</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg text-center">
                <p className="text-xs text-muted-foreground mb-1">Next Payment</p>
                <p className="font-semibold text-sm">Upcoming installment</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg text-center">
                <p className="text-xs text-muted-foreground mb-1">Current Balance</p>
                <p className="font-semibold text-sm">Outstanding amount</p>
              </div>
            </div>

            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-sm">
                <strong>📊 Progress Bar:</strong> A visual progress bar shows how far you are toward full ownership of your property.
              </p>
            </div>
          </Card>

          {/* Feature: Payment History */}
          <Card className="p-6 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-secondary/30 rounded-lg">
                <Calendar className="h-5 w-5 text-secondary-foreground" />
              </div>
              <h3 className="text-xl font-semibold">📆 Payment History</h3>
            </div>

            <div className="my-4 border-4 border-secondary/30 rounded-lg overflow-hidden shadow-lg">
              <img 
                src={paymentHistory} 
                alt="Payment History"
                className="w-full"
              />
              <div className="bg-gradient-to-r from-secondary/10 to-accent/10 p-3 text-sm text-center">
                <Badge variant="outline" className="text-xs font-semibold">Complete Payment History</Badge>
              </div>
            </div>
            
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>View all your past payments in one place</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>See payment dates and amounts</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Overdue payments are clearly highlighted</span>
              </li>
            </ul>
          </Card>
        </section>

        <Separator className="my-8" />

        {/* Section 4: Additional Notes / Security & Support */}
        <section id="support" className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/20 rounded-lg">
              <HelpCircle className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold">Additional Information</h2>
          </div>

          {/* Platform Compatibility */}
          <Card className="p-6 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <Monitor className="h-5 w-5 text-primary" />
              <Smartphone className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Works on All Devices</h3>
            </div>
            <p className="text-muted-foreground text-sm">
              This platform is fully <strong>mobile and desktop friendly</strong>. Access your account from your phone, tablet, or computer — anytime, anywhere.
            </p>
          </Card>

          {/* Security */}
          <Card className="p-6 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="h-5 w-5 text-primary" />
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Your Data is Secure</h3>
            </div>
            <p className="text-muted-foreground text-sm mb-3">
              All payment data and personal information is <strong>encrypted and secure</strong>. We use industry-standard security measures to protect your account.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Two-factor authentication (2FA) for added security</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Automatic session timeout for your protection</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Secure password requirements</span>
              </li>
            </ul>
          </Card>

          {/* Payment Reminders */}
          <Card className="p-6 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <Bell className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Stay on Track</h3>
            </div>
            <p className="text-muted-foreground text-sm">
              You will receive alerts as you approach your next payment due date. Keep your contact information up to date to ensure you never miss a reminder.
            </p>
          </Card>

          {/* Support - Updated to remove email, add Contact Support button */}
          <Card className="p-6 mb-4 bg-gradient-to-br from-primary/5 to-accent/5 border-2 border-primary/20">
            <div className="flex items-center gap-3 mb-4">
              <MessageCircle className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Need Help?</h3>
            </div>
            <p className="text-muted-foreground text-sm mb-4">
              We're here to support you. If you have any questions or need assistance with your account, please submit a support request and we'll get back to you promptly.
            </p>
            <div className="space-y-3">
              <Button 
                onClick={() => navigate('/support')} 
                className="w-full"
                size="lg"
              >
                <MessageCircle className="mr-2 h-5 w-5" />
                Contact Support
              </Button>
              <div className="flex items-center gap-3 p-3 bg-card rounded-lg">
                <Download className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">Download Documents</p>
                  <p className="text-xs text-muted-foreground">
                    Access your statements and agreements anytime from the portal
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Quick Links Footer */}
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
            onClick={() => navigate('/support')}
            className="h-auto py-4"
          >
            <MessageCircle className="mr-2 h-5 w-5" />
            Contact Support
          </Button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Guide;
