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
  Globe,
  Smartphone,
  Clock,
  TrendingUp,
  Building2,
  Wallet,
  FileCheck,
  HeadphonesIcon
} from "lucide-react";

const StandLedgerLanding = () => {
  const whatsappNumber = "263783002138";
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hi, I'm interested in learning more about StandLedger for my development project.")}`;

  return (
    <div className="min-h-screen bg-sl-cream">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-sl-green/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-sl-green rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">S</span>
              </div>
              <span className="text-xl font-bold text-sl-charcoal">StandLedger</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#problem" className="text-sl-charcoal/70 hover:text-sl-green transition-colors">The Problem</a>
              <a href="#solution" className="text-sl-charcoal/70 hover:text-sl-green transition-colors">Solution</a>
              <a href="#how-it-works" className="text-sl-charcoal/70 hover:text-sl-green transition-colors">How It Works</a>
              <a href="#pricing" className="text-sl-charcoal/70 hover:text-sl-green transition-colors">Pricing</a>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                className="border-sl-green text-sl-green hover:bg-sl-green hover:text-white hidden sm:flex"
                onClick={() => window.open(whatsappLink, '_blank')}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                WhatsApp
              </Button>
              <Button className="bg-sl-green hover:bg-sl-green-dark text-white">
                Request Demo
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-sl-green via-sl-green-dark to-sl-charcoal relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-64 h-64 bg-sl-gold rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-sl-gold rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
                <span className="w-2 h-2 bg-sl-gold rounded-full animate-pulse" />
                <span className="text-white/90 text-sm font-medium">Built for Zimbabwe's Property Developers</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
                Turn Installment Payments Into a{" "}
                <span className="text-sl-gold">Professional Financial System</span>
              </h1>
              <p className="text-xl text-white/80 mb-8 leading-relaxed">
                StandLedger is the fintech platform that gives land developers and construction companies 
                banking-grade payment tracking, monthly statements, and customer portals — without the complexity.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="bg-sl-gold hover:bg-sl-gold-dark text-sl-charcoal font-semibold text-lg px-8">
                  Request a Demo
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-white/30 text-white hover:bg-white/10"
                  onClick={() => window.open(whatsappLink, '_blank')}
                >
                  <MessageSquare className="w-5 h-5 mr-2" />
                  Talk to Us on WhatsApp
                </Button>
              </div>
              <div className="mt-10 flex items-center gap-6">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-10 h-10 rounded-full bg-sl-gold/80 border-2 border-white flex items-center justify-center">
                      <Users className="w-5 h-5 text-sl-charcoal" />
                    </div>
                  ))}
                </div>
                <div className="text-white/80">
                  <span className="font-semibold text-white">500+</span> diaspora buyers served
                </div>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <div className="bg-white rounded-2xl shadow-2xl p-6 transform rotate-2 hover:rotate-0 transition-transform duration-500">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-sl-green/10 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-sl-green" />
                  </div>
                  <div>
                    <p className="font-semibold text-sl-charcoal">Monthly Statement</p>
                    <p className="text-sm text-sl-charcoal/60">January 2026</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-sl-green/10">
                    <span className="text-sl-charcoal/70">Opening Balance</span>
                    <span className="font-semibold text-sl-charcoal">$45,000.00</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-sl-green/10">
                    <span className="text-sl-charcoal/70">Payments Received</span>
                    <span className="font-semibold text-sl-green">-$2,500.00</span>
                  </div>
                  <div className="flex justify-between py-2 bg-sl-green/5 rounded-lg px-3">
                    <span className="font-semibold text-sl-charcoal">Closing Balance</span>
                    <span className="font-bold text-sl-green">$42,500.00</span>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-6 bg-sl-gold rounded-xl shadow-xl p-4 transform -rotate-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-sl-charcoal" />
                  <span className="font-medium text-sl-charcoal">Payment Confirmed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section id="problem" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block bg-red-100 text-red-700 px-4 py-1 rounded-full text-sm font-medium mb-4">
              The Reality Today
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-sl-charcoal mb-4">
              The Money is There — But the Systems Are Not
            </h2>
            <p className="text-xl text-sl-charcoal/70 max-w-3xl mx-auto">
              Developers are losing time, trust, and revenue because they're managing millions in installment 
              payments with tools built for grocery lists.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: FileText, title: "Manual Spreadsheets", desc: "Hours spent updating Excel files that break, duplicate, and confuse" },
              { icon: MessageSquare, title: "WhatsApp Payment Chaos", desc: "Screenshots lost in chat. No audit trail. No accountability." },
              { icon: Clock, title: "Missed Payments", desc: "No automated reminders. No overdue tracking. Revenue slips away." },
              { icon: Globe, title: "Diaspora Demands", desc: "UK and US buyers expect bank-level statements. They're not getting them." },
              { icon: Users, title: "Balance Disputes", desc: "\"I paid that already!\" Without records, every conversation is a fight." },
              { icon: BarChart3, title: "Director Blind Spots", desc: "No dashboards. No reports. No visibility into cash flow." },
            ].map((item, i) => (
              <Card key={i} className="border-red-200/50 bg-red-50/30 hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                    <item.icon className="w-6 h-6 text-red-600" />
                  </div>
                  <h3 className="font-semibold text-sl-charcoal mb-2">{item.title}</h3>
                  <p className="text-sl-charcoal/70">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section id="solution" className="py-20 px-4 sm:px-6 lg:px-8 bg-sl-cream">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block bg-sl-green/10 text-sl-green px-4 py-1 rounded-full text-sm font-medium mb-4">
              The StandLedger Solution
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-sl-charcoal mb-4">
              Professional Financial Infrastructure for Property Sales
            </h2>
            <p className="text-xl text-sl-charcoal/70 max-w-3xl mx-auto">
              Replace chaos with clarity. StandLedger gives your buyers the transparency they demand 
              and your team the tools they need.
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              {[
                { icon: FileText, title: "Automated Monthly Statements", desc: "Bank-grade statements generated every month. Immutable. Professional. Trusted." },
                { icon: Shield, title: "Secure Customer Portals", desc: "Every buyer gets their own login. Payment history. Documents. Everything in one place." },
                { icon: BarChart3, title: "Real-Time Reporting", desc: "Directors see cash flow, overdue accounts, and project health at a glance." },
                { icon: MessageSquare, title: "WhatsApp-Friendly Support", desc: "Customers reach you through familiar channels. Cases tracked professionally." },
              ].map((item, i) => (
                <div key={i} className="flex gap-4 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 bg-sl-green/10 rounded-lg flex items-center justify-center shrink-0">
                    <item.icon className="w-6 h-6 text-sl-green" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sl-charcoal mb-1">{item.title}</h3>
                    <p className="text-sl-charcoal/70">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-sl-green rounded-2xl p-8 text-white">
              <h3 className="text-2xl font-bold mb-6">What Changes for You</h3>
              <div className="space-y-4">
                {[
                  "No more manual statement creation",
                  "No more balance disputes",
                  "No more lost payment records",
                  "No more director blind spots",
                  "No more unprofessional customer experience",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-sl-gold shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-8 p-4 bg-white/10 rounded-xl">
                <p className="text-white/90 italic">
                  "StandLedger turns installment payments into a professional financial system."
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block bg-sl-gold/20 text-sl-gold-dark px-4 py-1 rounded-full text-sm font-medium mb-4">
              Simple Setup
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-sl-charcoal mb-4">
              Go Live in Days, Not Months
            </h2>
            <p className="text-xl text-sl-charcoal/70 max-w-3xl mx-auto">
              No complex integrations. No system rebuilds. One Google Sheet is enough.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { step: "1", title: "Share Your Data", desc: "Give us your existing Google Sheet with customer and payment data.", icon: FileCheck },
              { step: "2", title: "We Configure", desc: "We set up StandLedger to match your project structure and branding.", icon: Building2 },
              { step: "3", title: "Portals Go Live", desc: "Your customers receive secure login access to their personal portals.", icon: Users },
              { step: "4", title: "Statements Flow", desc: "Monthly statements are generated and delivered automatically.", icon: TrendingUp },
            ].map((item, i) => (
              <div key={i} className="relative">
                <div className="text-center">
                  <div className="w-16 h-16 bg-sl-green text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold shadow-lg">
                    {item.step}
                  </div>
                  <div className="w-12 h-12 bg-sl-gold/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <item.icon className="w-6 h-6 text-sl-gold-dark" />
                  </div>
                  <h3 className="font-semibold text-sl-charcoal mb-2">{item.title}</h3>
                  <p className="text-sl-charcoal/70">{item.desc}</p>
                </div>
                {i < 3 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full">
                    <ArrowRight className="w-6 h-6 text-sl-green/30 mx-auto" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <div className="inline-flex items-center gap-2 bg-sl-green/5 rounded-full px-6 py-3">
              <CheckCircle className="w-5 h-5 text-sl-green" />
              <span className="text-sl-charcoal font-medium">Most projects go live within 2 weeks</span>
            </div>
          </div>
        </div>
      </section>

      {/* Case Study */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-sl-charcoal to-sl-green-dark">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block bg-sl-gold/20 text-sl-gold px-4 py-1 rounded-full text-sm font-medium mb-4">
                Case Study
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
                How LakeCity Transformed Their Customer Experience
              </h2>
              <p className="text-white/80 mb-6 text-lg">
                LakeCity is a leading land development company in Zimbabwe, selling residential stands 
                to diaspora buyers across the UK, US, Canada, and Australia.
              </p>
              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-red-500/20 rounded-full flex items-center justify-center mt-1 shrink-0">
                    <span className="text-red-400 text-xs">✗</span>
                  </div>
                  <p className="text-white/70">
                    <span className="font-semibold text-white">Before:</span> Manual Excel tracking, 
                    WhatsApp payment screenshots, constant balance disputes, no formal statements.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-sl-gold/20 rounded-full flex items-center justify-center mt-1 shrink-0">
                    <CheckCircle className="w-4 h-4 text-sl-gold" />
                  </div>
                  <p className="text-white/70">
                    <span className="font-semibold text-white">After:</span> Every buyer receives a 
                    professional monthly statement automatically. Disputes dropped. Trust increased.
                  </p>
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/10">
                <p className="text-white italic text-lg mb-4">
                  "LakeCity now issues a monthly statement to every buyer — automatically."
                </p>
                <p className="text-sl-gold font-medium">— LakeCity Management Team</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: "100%", label: "Statements Automated" },
                { value: "500+", label: "Buyers Served" },
                { value: "80%", label: "Fewer Disputes" },
                { value: "2 Weeks", label: "Time to Go Live" },
              ].map((stat, i) => (
                <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-center border border-white/10">
                  <p className="text-3xl font-bold text-sl-gold mb-2">{stat.value}</p>
                  <p className="text-white/70">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-sl-cream">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block bg-sl-green/10 text-sl-green px-4 py-1 rounded-full text-sm font-medium mb-4">
              Platform Features
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-sl-charcoal mb-4">
              Everything You Need to Manage Installment Sales
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: FileText, title: "Monthly Statement Engine", desc: "Immutable snapshots generated automatically. Professional. Auditable. Trusted." },
              { icon: Users, title: "Customer Payment Portals", desc: "Secure login for every buyer. Payment history, balance, and documents in one place." },
              { icon: Building2, title: "Multi-Stand Support", desc: "Customers with multiple properties see everything organized by stand." },
              { icon: FileCheck, title: "Agreement of Sale Access", desc: "Digital access to signed agreements. No more lost paperwork." },
              { icon: Clock, title: "Overdue Tracking", desc: "Automatic flagging of late payments. Clear visibility for your team." },
              { icon: HeadphonesIcon, title: "WhatsApp Support Workflow", desc: "Customers reach you on WhatsApp. Cases tracked and resolved professionally." },
              { icon: BarChart3, title: "Director Reporting", desc: "Cash flow dashboards. Project health metrics. Compliance-ready exports." },
              { icon: Wallet, title: "Payment Recording", desc: "Log payments with full audit trails. Integration-ready for future banking." },
              { icon: Shield, title: "Data Security", desc: "Bank-grade encryption. Role-based access. Your data is protected." },
            ].map((item, i) => (
              <Card key={i} className="border-sl-green/10 hover:shadow-lg hover:border-sl-green/30 transition-all">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-sl-green/10 rounded-lg flex items-center justify-center mb-4">
                    <item.icon className="w-6 h-6 text-sl-green" />
                  </div>
                  <h3 className="font-semibold text-sl-charcoal mb-2">{item.title}</h3>
                  <p className="text-sl-charcoal/70">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block bg-sl-gold/20 text-sl-gold-dark px-4 py-1 rounded-full text-sm font-medium mb-4">
              Transparent Pricing
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-sl-charcoal mb-4">
              You Only Pay As Your Project Grows
            </h2>
            <p className="text-xl text-sl-charcoal/70 max-w-3xl mx-auto">
              No hidden fees. No long-term contracts. Pricing that scales with your success.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* One-Time Setup */}
            <Card className="border-sl-green/20 hover:shadow-xl transition-shadow">
              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <span className="inline-block bg-sl-green/10 text-sl-green px-3 py-1 rounded-full text-sm font-medium mb-4">
                    One-Time
                  </span>
                  <h3 className="text-xl font-bold text-sl-charcoal mb-2">Setup Fee</h3>
                  <div className="text-4xl font-bold text-sl-green mb-2">
                    $1,500 <span className="text-lg text-sl-charcoal/50">– $5,000</span>
                  </div>
                  <p className="text-sl-charcoal/60">USD</p>
                </div>
                <div className="space-y-3">
                  {[
                    "White-label branding setup",
                    "Platform configuration",
                    "Historical data import",
                    "Team training sessions",
                    "Go-live support",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-sl-green shrink-0" />
                      <span className="text-sl-charcoal/70">{item}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Monthly Platform Fee */}
            <Card className="border-sl-gold shadow-xl scale-105 relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="bg-sl-gold text-sl-charcoal px-4 py-1 rounded-full text-sm font-semibold">
                  Most Popular
                </span>
              </div>
              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <span className="inline-block bg-sl-gold/20 text-sl-gold-dark px-3 py-1 rounded-full text-sm font-medium mb-4">
                    Monthly
                  </span>
                  <h3 className="text-xl font-bold text-sl-charcoal mb-2">Platform Fee</h3>
                  <div className="text-4xl font-bold text-sl-charcoal mb-2">
                    $250 <span className="text-lg text-sl-charcoal/50">– $750</span>
                  </div>
                  <p className="text-sl-charcoal/60">USD / month</p>
                </div>
                <div className="space-y-3">
                  {[
                    "Full platform access",
                    "Monthly statement generation",
                    "Customer portal hosting",
                    "Support ticket system",
                    "Reporting dashboards",
                    "Email & WhatsApp support",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-sl-gold-dark shrink-0" />
                      <span className="text-sl-charcoal/70">{item}</span>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-sl-charcoal/50 mt-4 text-center">
                  Based on customer count & project size
                </p>
              </CardContent>
            </Card>

            {/* Per-Stand Fee */}
            <Card className="border-sl-green/20 hover:shadow-xl transition-shadow">
              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <span className="inline-block bg-sl-green/10 text-sl-green px-3 py-1 rounded-full text-sm font-medium mb-4">
                    Per Stand
                  </span>
                  <h3 className="text-xl font-bold text-sl-charcoal mb-2">Usage Fee</h3>
                  <div className="text-4xl font-bold text-sl-green mb-2">
                    $1.50 <span className="text-lg text-sl-charcoal/50">– $3.00</span>
                  </div>
                  <p className="text-sl-charcoal/60">USD / stand / month</p>
                </div>
                <div className="space-y-3">
                  {[
                    "Individual stand tracking",
                    "Payment history per stand",
                    "Statement generation",
                    "Portal access for buyer",
                    "Support case handling",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-sl-green shrink-0" />
                      <span className="text-sl-charcoal/70">{item}</span>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-sl-charcoal/50 mt-4 text-center">
                  Only active stands are billed
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-sl-cream">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12">
            <div>
              <span className="inline-block bg-sl-green/10 text-sl-green px-4 py-1 rounded-full text-sm font-medium mb-4">
                Perfect For
              </span>
              <h2 className="text-3xl font-bold text-sl-charcoal mb-6">Built for Growing Developers</h2>
              <div className="space-y-4">
                {[
                  "Land developers selling on installment payment plans",
                  "Construction projects funded by diaspora buyers",
                  "Housing estates with 50+ active customers",
                  "Companies scaling beyond Excel spreadsheets",
                  "Directors who need visibility into cash flow",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm">
                    <CheckCircle className="w-5 h-5 text-sl-green shrink-0" />
                    <span className="text-sl-charcoal">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className="inline-block bg-red-100 text-red-700 px-4 py-1 rounded-full text-sm font-medium mb-4">
                Not Designed For
              </span>
              <h2 className="text-3xl font-bold text-sl-charcoal mb-6">May Not Be the Right Fit</h2>
              <div className="space-y-4">
                {[
                  "Cash-only property sales with no installments",
                  "One-off transactions without recurring payments",
                  "Projects with fewer than 20 customers",
                  "Companies not ready to formalize their processes",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm">
                    <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                      <span className="text-red-500 text-sm">✗</span>
                    </span>
                    <span className="text-sl-charcoal">{item}</span>
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
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to Professionalize Your Payment Operations?
          </h2>
          <p className="text-xl text-white/80 mb-8">
            Join developers who've transformed their customer experience with StandLedger.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-sl-gold hover:bg-sl-gold-dark text-sl-charcoal font-semibold text-lg px-8">
              Request a Demo
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white/30 text-white hover:bg-white/10"
              onClick={() => window.open(whatsappLink, '_blank')}
            >
              <MessageSquare className="w-5 h-5 mr-2" />
              Chat on WhatsApp
            </Button>
          </div>
          <p className="text-white/60 mt-6 text-sm">
            📞 +263 78 300 2138 • ✉️ info@standsledger.io
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-sl-charcoal">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-sl-green rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">S</span>
              </div>
              <span className="text-xl font-bold text-white">StandLedger</span>
            </div>
            <p className="text-white/50 text-sm">
              © {new Date().getFullYear()} StandLedger. Professional financial infrastructure for property developers.
            </p>
            <div className="flex items-center gap-4">
              <Smartphone className="w-5 h-5 text-white/50" />
              <span className="text-white/70">+263 78 300 2138</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default StandLedgerLanding;
