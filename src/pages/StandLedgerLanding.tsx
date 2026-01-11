import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  CheckCircle, 
  FileText, 
  Users, 
  BarChart3, 
  MessageSquare, 
  Shield, 
  ArrowRight,
  Clock,
  FileCheck,
  Settings,
  AlertTriangle,
  HelpCircle,
  FileX,
  Table,
  MessageCircle,
  ClipboardCheck,
  Menu
} from "lucide-react";
import { useState } from "react";

const StandLedgerLanding = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const whatsappNumber = "263783002138";
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hi, I'm interested in learning more about StandLedger for my development project.")}`;

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-sl-cream font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-sl-charcoal/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-sl-green rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">S</span>
              </div>
              <span className="text-xl font-semibold text-sl-charcoal tracking-tight">StandLedger</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <button onClick={() => scrollToSection('problem')} className="text-sl-charcoal/70 hover:text-sl-green transition-colors">The Problem</button>
              <button onClick={() => scrollToSection('how-it-works')} className="text-sl-charcoal/70 hover:text-sl-green transition-colors">How It Works</button>
              <button onClick={() => scrollToSection('features')} className="text-sl-charcoal/70 hover:text-sl-green transition-colors">Features</button>
              <button onClick={() => scrollToSection('pricing')} className="text-sl-charcoal/70 hover:text-sl-green transition-colors">Pricing</button>
            </div>
            <button 
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu className="w-6 h-6 text-sl-charcoal" />
            </button>
          </div>
        </div>
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-sl-charcoal/5 py-4 px-4 space-y-3">
            <button onClick={() => scrollToSection('problem')} className="block w-full text-left py-2 text-sl-charcoal/70">The Problem</button>
            <button onClick={() => scrollToSection('how-it-works')} className="block w-full text-left py-2 text-sl-charcoal/70">How It Works</button>
            <button onClick={() => scrollToSection('features')} className="block w-full text-left py-2 text-sl-charcoal/70">Features</button>
            <button onClick={() => scrollToSection('pricing')} className="block w-full text-left py-2 text-sl-charcoal/70">Pricing</button>
          </div>
        )}
      </nav>

      {/* Hero Section - Bold gradient with serif typography */}
      <section className="pt-24 pb-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-sl-green via-sl-green-dark/90 to-sl-cream" />
        
        <div className="max-w-5xl mx-auto relative pt-12 pb-8">
          <div className="text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-5 py-2.5 mb-8">
              <span className="w-2 h-2 bg-sl-gold rounded-full" />
              <span className="text-white/90 text-sm font-medium">Built for Zimbabwe's Property Market</span>
            </div>
            
            {/* Main headline with serif font */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-serif font-bold text-white leading-[1.1] mb-6 tracking-tight">
              Turn Installment Payments Into a{" "}
              <span className="text-sl-gold italic">Professional Financial System</span>
            </h1>
            
            <p className="text-lg sm:text-xl text-white/75 mb-10 max-w-3xl mx-auto leading-relaxed">
              StandLedger helps land developers and construction companies manage 
              diaspora buyer payments with bank-grade tracking, automated statements, 
              and transparent customer portals.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mb-10">
              {[
                "Automated monthly statements",
                "Secure customer portals",
                "Bank-grade payment tracking"
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-2 text-white/80">
                  <CheckCircle className="w-5 h-5 text-sl-gold" />
                  <span className="text-sm sm:text-base">{feature}</span>
                </div>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
              <Button 
                size="lg" 
                className="bg-sl-gold hover:bg-sl-gold-dark text-sl-charcoal font-semibold text-lg px-8 h-14 rounded-lg shadow-lg"
              >
                Request a Demo
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-white/30 bg-sl-charcoal/30 backdrop-blur-sm text-white hover:bg-sl-charcoal/50 font-medium text-lg px-8 h-14 rounded-lg"
                onClick={() => scrollToSection('how-it-works')}
              >
                See How It Works
              </Button>
            </div>

            {/* Trust indicator */}
            <p className="text-white/50 text-sm">
              Already trusted by leading developers like LakeCity Estates
            </p>
          </div>
        </div>
      </section>

      {/* Problem Section - Clean cards with red icons */}
      <section id="problem" className="py-20 px-4 sm:px-6 lg:px-8 bg-sl-cream">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block text-sl-gold font-semibold text-sm tracking-widest uppercase mb-4">
              THE PROBLEM
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-sl-charcoal leading-tight">
              The Money Is There —<br />
              <span className="font-bold">But the Systems Are Not</span>
            </h2>
            <p className="text-lg text-sl-charcoal/60 max-w-3xl mx-auto mt-6">
              Diaspora buyers are investing in Zimbabwe's property boom. But developers are struggling with 
              outdated tools that can't handle installment complexity.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {[
              { 
                icon: Table, 
                title: "Manual Spreadsheets", 
                desc: "Endless hours updating cells, prone to human error and version conflicts." 
              },
              { 
                icon: MessageCircle, 
                title: "WhatsApp Chaos", 
                desc: "Payment confirmations scattered across chat threads, impossible to track." 
              },
              { 
                icon: Clock, 
                title: "Missed Payments", 
                desc: "No automated reminders means money slipping through the cracks." 
              },
              { 
                icon: HelpCircle, 
                title: "Balance Disputes", 
                desc: "Customers questioning amounts with no clear audit trail to reference." 
              },
              { 
                icon: FileX, 
                title: "No Formal Statements", 
                desc: "Diaspora buyers expecting professional documentation, getting nothing." 
              },
              { 
                icon: AlertTriangle, 
                title: "Reconciliation Nightmares", 
                desc: "Directors spending weekends matching payments to customers." 
              },
            ].map((item, i) => (
              <Card key={i} className="border border-sl-charcoal/5 bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6 sm:p-8">
                  <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-5">
                    <item.icon className="w-6 h-6 text-red-500" />
                  </div>
                  <h3 className="font-bold text-lg text-sl-charcoal mb-2">{item.title}</h3>
                  <p className="text-sl-charcoal/60 leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works - Step cards with gold badges */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block text-sl-gold font-semibold text-sm tracking-widest uppercase mb-4">
              HOW IT WORKS
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-sl-charcoal leading-tight">
              From Google Sheet to{" "}
              <span className="text-sl-gold italic">Financial System</span>
            </h2>
            <p className="text-lg text-sl-charcoal/60 max-w-2xl mx-auto mt-6">
              No complex integrations. No system rebuilds. One Google Sheet is enough.
            </p>
          </div>

          <div className="space-y-6 max-w-4xl mx-auto">
            {[
              { 
                step: "01", 
                icon: FileText, 
                title: "Share Your Spreadsheet", 
                desc: "Give us your existing Google Sheet with customer and payment data. That's all we need to get started." 
              },
              { 
                step: "02", 
                icon: Settings, 
                title: "We Configure StandLedger", 
                desc: "Our team maps your data structure and configures the platform to match your project's requirements." 
              },
              { 
                step: "03", 
                icon: Users, 
                title: "Customers Get Portal Access", 
                desc: "Each buyer receives secure login credentials to view their balance, payment history, and documents." 
              },
              { 
                step: "04", 
                icon: ClipboardCheck, 
                title: "Statements Generate Automatically", 
                desc: "Monthly financial statements are produced without any manual work. Bank-grade documentation, every month." 
              },
            ].map((item, i) => (
              <div key={i} className="relative">
                {/* Step number badge */}
                <div className="absolute -left-3 sm:left-0 top-0 w-10 h-10 bg-sl-gold rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-md z-10">
                  {item.step}
                </div>
                
                <Card className="ml-4 sm:ml-6 border border-sl-charcoal/5 bg-sl-cream/50 rounded-2xl shadow-sm">
                  <CardContent className="p-6 sm:p-8 pl-10 sm:pl-12">
                    <div className="w-12 h-12 bg-sl-charcoal/5 rounded-xl flex items-center justify-center mb-4">
                      <item.icon className="w-6 h-6 text-sl-green" />
                    </div>
                    <h3 className="font-bold text-xl text-sl-charcoal mb-2">{item.title}</h3>
                    <p className="text-sl-charcoal/60 leading-relaxed">{item.desc}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>

          {/* Inline CTA */}
          <div className="mt-12 flex justify-center">
            <div className="inline-flex items-center gap-4 bg-sl-cream rounded-full px-4 py-2 shadow-sm border border-sl-charcoal/5">
              <span className="text-sl-charcoal/70">Ready to simplify your operations?</span>
              <Button className="bg-sl-gold hover:bg-sl-gold-dark text-sl-charcoal font-semibold rounded-full px-5">
                Get Started
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid - Dark green section with glass cards */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-sl-green">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block text-sl-gold font-semibold text-sm tracking-widest uppercase mb-4">
              FEATURES
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-white leading-tight">
              Everything You Need to{" "}
              <span className="text-sl-gold italic">Professionalize Payments</span>
            </h2>
            <p className="text-lg text-white/60 max-w-3xl mx-auto mt-6">
              StandLedger replaces fragmented tools with one integrated platform designed for installment-based property sales.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5 max-w-5xl mx-auto">
            {[
              { icon: FileText, title: "Monthly Statement Engine", desc: "Immutable snapshots of every customer's account, generated automatically. No manual work required." },
              { icon: Users, title: "Customer Payment Portals", desc: "Secure online access for buyers to view balances, payment history, and download statements." },
              { icon: BarChart3, title: "Multi-Stand Support", desc: "Customers with multiple plots see a unified view while you manage each stand separately." },
              { icon: FileCheck, title: "Agreement of Sale Access", desc: "Upload and share signed agreements through the secure portal. Always available, always verified." },
              { icon: AlertTriangle, title: "Overdue Tracking", desc: "Automatic flagging of late payments with configurable grace periods and escalation paths." },
              { icon: MessageSquare, title: "WhatsApp-Friendly Support", desc: "Integration points designed for the way your customers actually communicate." },
              { icon: BarChart3, title: "Director Reporting", desc: "Executive dashboards showing collection rates, outstanding balances, and project health." },
              { icon: Shield, title: "Compliance Ready", desc: "Audit trails and documentation that meet financial reporting standards." },
            ].map((item, i) => (
              <div 
                key={i} 
                className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-6 sm:p-8 hover:bg-white/15 transition-colors"
              >
                <div className="w-11 h-11 bg-sl-gold/20 rounded-xl flex items-center justify-center mb-5">
                  <item.icon className="w-5 h-5 text-sl-gold" />
                </div>
                <h3 className="font-bold text-lg text-sl-gold mb-2">{item.title}</h3>
                <p className="text-white/70 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case Study */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16">
            <span className="inline-block text-sl-gold font-semibold text-sm tracking-widest uppercase mb-4">
              CASE STUDY
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-sl-charcoal leading-tight">
              How LakeCity Estates{" "}
              <span className="text-sl-green italic">Transformed Their Operations</span>
            </h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <p className="text-lg text-sl-charcoal mb-4">
                <span className="font-bold">The Challenge:</span>{" "}
                <span className="text-sl-charcoal/70">
                  LakeCity Estates, a leading residential developer in Harare, was managing 400+ installment customers across 
                  multiple projects. Their diaspora buyers — primarily in the UK and Australia — were demanding professional financial 
                  documentation.
                </span>
              </p>
              <p className="text-lg text-sl-charcoal/70 mb-8">
                Manual spreadsheets and WhatsApp threads weren't cutting it. Directors were spending entire weekends reconciling payments.
              </p>

              <div className="space-y-4 mb-8">
                {[
                  "Monthly bank-grade statements for every buyer",
                  "Reduced disputes by 85%",
                  "Improved customer trust and retention",
                  "Professional reporting for directors and investors",
                  "Zero manual statement generation",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-sl-gold shrink-0" />
                    <span className="font-medium text-sl-charcoal">{item}</span>
                  </div>
                ))}
              </div>

              <Button 
                size="lg"
                className="bg-sl-green hover:bg-sl-green-dark text-white font-semibold rounded-lg px-8"
              >
                Get Similar Results
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>

            {/* Testimonial card */}
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-sl-cream to-white rounded-3xl transform rotate-1" />
              <Card className="relative border-0 shadow-xl rounded-2xl overflow-hidden">
                <CardContent className="p-8 sm:p-10">
                  {/* Quote mark */}
                  <div className="text-sl-gold text-6xl font-serif leading-none mb-4">"</div>
                  
                  <p className="text-xl sm:text-2xl font-serif text-sl-charcoal leading-relaxed mb-8">
                    LakeCity now issues a monthly statement to every buyer — automatically. Our diaspora clients 
                    finally have the transparency they were asking for, and our team reclaimed their weekends.
                  </p>

                  <div className="flex items-center gap-4 pb-8 border-b border-sl-charcoal/10">
                    <div className="w-14 h-14 bg-sl-cream rounded-full flex items-center justify-center">
                      <span className="font-bold text-sl-charcoal text-lg">LC</span>
                    </div>
                    <div>
                      <p className="font-bold text-sl-charcoal">LakeCity Estates</p>
                      <p className="text-sl-charcoal/60">Harare, Zimbabwe</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 mt-8">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-sl-charcoal">400+</p>
                      <p className="text-sm text-sl-charcoal/60">Customers</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-sl-gold">85%</p>
                      <p className="text-sm text-sl-charcoal/60">Less Disputes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-sl-charcoal">0</p>
                      <p className="text-sm text-sl-charcoal/60">Manual Work</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-sl-cream">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block text-sl-gold font-semibold text-sm tracking-widest uppercase mb-4">
              TRANSPARENT PRICING
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-sl-charcoal leading-tight">
              You Only Pay As Your{" "}
              <span className="text-sl-gold italic">Project Grows</span>
            </h2>
            <p className="text-lg text-sl-charcoal/60 max-w-2xl mx-auto mt-6">
              No hidden fees. No long-term contracts. Pricing that scales with your success.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* One-Time Setup */}
            <Card className="border border-sl-charcoal/10 bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow">
              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <span className="inline-block bg-sl-green/10 text-sl-green px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
                    One-Time
                  </span>
                  <h3 className="text-xl font-bold text-sl-charcoal mb-3">Setup Fee</h3>
                  <div className="text-4xl font-bold text-sl-charcoal">
                    $1,500 <span className="text-lg text-sl-charcoal/40 font-normal">– $5,000</span>
                  </div>
                  <p className="text-sl-charcoal/50 mt-1">USD</p>
                </div>
                <div className="space-y-3 pt-6 border-t border-sl-charcoal/10">
                  {[
                    "White-label branding setup",
                    "Platform configuration",
                    "Historical data import",
                    "Team training sessions",
                    "Go-live support",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-sl-green shrink-0" />
                      <span className="text-sl-charcoal/70">{item}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Monthly Platform Fee - Featured */}
            <Card className="border-2 border-sl-gold bg-white rounded-2xl shadow-xl relative transform md:-translate-y-4">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="bg-sl-gold text-white px-5 py-1.5 rounded-full text-sm font-bold shadow-md">
                  Most Popular
                </span>
              </div>
              <CardContent className="p-8 pt-10">
                <div className="text-center mb-6">
                  <span className="inline-block bg-sl-gold/20 text-sl-gold-dark px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
                    Monthly
                  </span>
                  <h3 className="text-xl font-bold text-sl-charcoal mb-3">Platform Fee</h3>
                  <div className="text-4xl font-bold text-sl-charcoal">
                    $250 <span className="text-lg text-sl-charcoal/40 font-normal">– $750</span>
                  </div>
                  <p className="text-sl-charcoal/50 mt-1">USD / month</p>
                </div>
                <div className="space-y-3 pt-6 border-t border-sl-charcoal/10">
                  {[
                    "Full platform access",
                    "Monthly statement generation",
                    "Customer portal hosting",
                    "Support ticket system",
                    "Reporting dashboards",
                    "Email & WhatsApp support",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-sl-gold shrink-0" />
                      <span className="text-sl-charcoal/70">{item}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-sl-charcoal/40 mt-4 text-center">
                  Based on customer count & project size
                </p>
              </CardContent>
            </Card>

            {/* Per-Stand Fee */}
            <Card className="border border-sl-charcoal/10 bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow">
              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <span className="inline-block bg-sl-green/10 text-sl-green px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
                    Per Stand
                  </span>
                  <h3 className="text-xl font-bold text-sl-charcoal mb-3">Usage Fee</h3>
                  <div className="text-4xl font-bold text-sl-charcoal">
                    $1.50 <span className="text-lg text-sl-charcoal/40 font-normal">– $3.00</span>
                  </div>
                  <p className="text-sl-charcoal/50 mt-1">USD / stand / month</p>
                </div>
                <div className="space-y-3 pt-6 border-t border-sl-charcoal/10">
                  {[
                    "Individual stand tracking",
                    "Payment history per stand",
                    "Statement generation",
                    "Portal access for buyer",
                    "Support case handling",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-sl-green shrink-0" />
                      <span className="text-sl-charcoal/70">{item}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-sl-charcoal/40 mt-4 text-center">
                  Only active stands are billed
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12">
            <div>
              <span className="inline-block text-sl-green font-semibold text-sm tracking-widest uppercase mb-4">
                PERFECT FOR
              </span>
              <h2 className="text-3xl font-serif font-bold text-sl-charcoal mb-8">Built for Growing Developers</h2>
              <div className="space-y-4">
                {[
                  "Land developers selling on installment payment plans",
                  "Construction projects funded by diaspora buyers",
                  "Housing estates with 50+ active customers",
                  "Companies scaling beyond Excel spreadsheets",
                  "Directors who need visibility into cash flow",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-sl-cream rounded-xl">
                    <CheckCircle className="w-5 h-5 text-sl-green shrink-0" />
                    <span className="text-sl-charcoal font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className="inline-block text-red-600 font-semibold text-sm tracking-widest uppercase mb-4">
                NOT DESIGNED FOR
              </span>
              <h2 className="text-3xl font-serif font-bold text-sl-charcoal mb-8">May Not Be the Right Fit</h2>
              <div className="space-y-4">
                {[
                  "Cash-only property sales with no installments",
                  "One-off transactions without recurring payments",
                  "Projects with fewer than 20 customers",
                  "Companies not ready to formalize their processes",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-red-50/50 rounded-xl">
                    <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                      <span className="text-red-500 text-sm font-bold">✕</span>
                    </span>
                    <span className="text-sl-charcoal/80">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-sl-green">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-white mb-6">
            Ready to Professionalize Your Payment Operations?
          </h2>
          <p className="text-xl text-white/70 mb-10">
            Join developers who've transformed their customer experience with StandLedger.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-sl-gold hover:bg-sl-gold-dark text-sl-charcoal font-bold text-lg px-10 h-14 rounded-lg shadow-lg">
              Request a Demo
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white/30 text-white hover:bg-white/10 font-medium text-lg px-10 h-14 rounded-lg"
              onClick={() => window.open(whatsappLink, '_blank')}
            >
              <MessageSquare className="w-5 h-5 mr-2" />
              Chat on WhatsApp
            </Button>
          </div>
          <p className="text-white/50 mt-8 text-sm">
            📞 +263 78 300 2138 • ✉️ info@standsledger.io
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 sm:px-6 lg:px-8 bg-sl-charcoal">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-sl-green rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">S</span>
              </div>
              <span className="text-xl font-semibold text-white tracking-tight">StandLedger</span>
            </div>
            <p className="text-white/40 text-sm">
              © {new Date().getFullYear()} StandLedger. Professional financial infrastructure for property developers.
            </p>
            <div className="flex items-center gap-2 text-white/60">
              <span>+263 78 300 2138</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default StandLedgerLanding;
