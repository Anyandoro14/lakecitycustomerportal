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
  Menu,
  X
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
    <div className="min-h-screen bg-[#0a0f0d] font-sans">
      {/* Navigation - Dark glass effect */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0f0d]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-sl-gold to-sl-gold-dark rounded-lg flex items-center justify-center shadow-lg shadow-sl-gold/20">
                <span className="text-[#0a0f0d] font-bold text-xl">S</span>
              </div>
              <span className="text-xl font-bold text-white tracking-tight">StandLedger</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <button onClick={() => scrollToSection('problem')} className="text-white/60 hover:text-sl-gold transition-colors font-medium">The Problem</button>
              <button onClick={() => scrollToSection('how-it-works')} className="text-white/60 hover:text-sl-gold transition-colors font-medium">How It Works</button>
              <button onClick={() => scrollToSection('features')} className="text-white/60 hover:text-sl-gold transition-colors font-medium">Features</button>
              <button onClick={() => scrollToSection('pricing')} className="text-white/60 hover:text-sl-gold transition-colors font-medium">Pricing</button>
              <Button className="bg-sl-gold hover:bg-sl-gold-dark text-[#0a0f0d] font-bold px-6">
                Get Demo
              </Button>
            </div>
            <button 
              className="md:hidden p-2 text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#0a0f0d] border-t border-white/5 py-4 px-4 space-y-3">
            <button onClick={() => scrollToSection('problem')} className="block w-full text-left py-2 text-white/70 font-medium">The Problem</button>
            <button onClick={() => scrollToSection('how-it-works')} className="block w-full text-left py-2 text-white/70 font-medium">How It Works</button>
            <button onClick={() => scrollToSection('features')} className="block w-full text-left py-2 text-white/70 font-medium">Features</button>
            <button onClick={() => scrollToSection('pricing')} className="block w-full text-left py-2 text-white/70 font-medium">Pricing</button>
            <Button className="w-full bg-sl-gold hover:bg-sl-gold-dark text-[#0a0f0d] font-bold mt-4">
              Get Demo
            </Button>
          </div>
        )}
      </nav>

      {/* Hero Section - Full dark with dramatic gold accents */}
      <section className="pt-32 pb-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Dramatic gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f0d] via-[#0d1915] to-[#0a0f0d]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-sl-gold/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-sl-green/10 rounded-full blur-[120px]" />
        
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />
        
        <div className="max-w-6xl mx-auto relative pt-12 pb-8">
          <div className="text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full px-6 py-3 mb-10">
              <span className="w-2.5 h-2.5 bg-sl-gold rounded-full animate-pulse" />
              <span className="text-white/80 text-sm font-semibold tracking-wide uppercase">Built for Zimbabwe's Property Market</span>
            </div>
            
            {/* Main headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-serif font-bold text-white leading-[1.05] mb-8 tracking-tight">
              Turn Installment Payments<br />
              Into a{" "}
              <span className="bg-gradient-to-r from-sl-gold via-sl-gold to-sl-gold-dark bg-clip-text text-transparent">Professional</span>
              <br />
              <span className="bg-gradient-to-r from-sl-gold via-sl-gold to-sl-gold-dark bg-clip-text text-transparent">Financial System</span>
            </h1>
            
            <p className="text-xl sm:text-2xl text-white/50 mb-12 max-w-3xl mx-auto leading-relaxed font-light">
              StandLedger helps land developers and construction companies manage 
              diaspora buyer payments with bank-grade tracking, automated statements, 
              and transparent customer portals.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-sl-gold to-sl-gold-dark hover:from-sl-gold-dark hover:to-sl-gold text-[#0a0f0d] font-bold text-lg px-10 h-16 rounded-xl shadow-2xl shadow-sl-gold/30 transition-all hover:scale-105"
              >
                Request a Demo
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-2 border-white/20 bg-white/5 backdrop-blur-sm text-white hover:bg-white/10 hover:border-white/30 font-semibold text-lg px-10 h-16 rounded-xl"
                onClick={() => scrollToSection('how-it-works')}
              >
                See How It Works
              </Button>
            </div>

            {/* Feature pills */}
            <div className="flex flex-wrap justify-center gap-6 mb-12">
              {[
                "Automated monthly statements",
                "Secure customer portals",
                "Bank-grade payment tracking"
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full px-5 py-2.5">
                  <CheckCircle className="w-5 h-5 text-sl-gold" />
                  <span className="text-white/70 font-medium">{feature}</span>
                </div>
              ))}
            </div>

            {/* Trust indicator */}
            <div className="inline-flex items-center gap-4 text-white/30 text-sm">
              <span className="w-12 h-[1px] bg-gradient-to-r from-transparent to-white/20" />
              Already trusted by leading developers like LakeCity Estates
              <span className="w-12 h-[1px] bg-gradient-to-l from-transparent to-white/20" />
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section - Dark cards with red accents */}
      <section id="problem" className="py-24 px-4 sm:px-6 lg:px-8 bg-[#080c0a]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <span className="inline-block text-sl-gold font-bold text-sm tracking-[0.2em] uppercase mb-6">
              THE PROBLEM
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-white leading-tight mb-6">
              The Money Is There —<br />
              <span className="text-white/40">But the Systems Are Not</span>
            </h2>
            <p className="text-xl text-white/40 max-w-3xl mx-auto">
              Diaspora buyers are investing in Zimbabwe's property boom. But developers are struggling with 
              outdated tools that can't handle installment complexity.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {[
              { icon: Table, title: "Manual Spreadsheets", desc: "Endless hours updating cells, prone to human error and version conflicts." },
              { icon: MessageCircle, title: "WhatsApp Chaos", desc: "Payment confirmations scattered across chat threads, impossible to track." },
              { icon: Clock, title: "Missed Payments", desc: "No automated reminders means money slipping through the cracks." },
              { icon: HelpCircle, title: "Balance Disputes", desc: "Customers questioning amounts with no clear audit trail to reference." },
              { icon: FileX, title: "No Formal Statements", desc: "Diaspora buyers expecting professional documentation, getting nothing." },
              { icon: AlertTriangle, title: "Reconciliation Nightmares", desc: "Directors spending weekends matching payments to customers." },
            ].map((item, i) => (
              <div 
                key={i} 
                className="group bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] rounded-2xl p-8 hover:border-red-500/30 hover:bg-red-500/[0.02] transition-all duration-300"
              >
                <div className="w-14 h-14 bg-red-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-red-500/20 transition-colors">
                  <item.icon className="w-7 h-7 text-red-400" />
                </div>
                <h3 className="font-bold text-xl text-white mb-3">{item.title}</h3>
                <p className="text-white/40 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works - Dark with gold step numbers */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8 bg-[#0a0f0d] relative overflow-hidden">
        {/* Background accent */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[400px] h-[600px] bg-sl-green/5 rounded-full blur-[100px]" />
        
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-20">
            <span className="inline-block text-sl-gold font-bold text-sm tracking-[0.2em] uppercase mb-6">
              HOW IT WORKS
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-white leading-tight mb-6">
              From Google Sheet to<br />
              <span className="bg-gradient-to-r from-sl-gold to-sl-gold-dark bg-clip-text text-transparent">Financial System</span>
            </h2>
            <p className="text-xl text-white/40 max-w-2xl mx-auto">
              No complex integrations. No system rebuilds. One Google Sheet is enough.
            </p>
          </div>

          <div className="grid lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {[
              { step: "01", icon: FileText, title: "Share Your Spreadsheet", desc: "Give us your existing Google Sheet with customer and payment data." },
              { step: "02", icon: Settings, title: "We Configure StandLedger", desc: "Our team maps your data structure and configures the platform." },
              { step: "03", icon: Users, title: "Customers Get Access", desc: "Each buyer receives secure login credentials to their portal." },
              { step: "04", icon: ClipboardCheck, title: "Statements Automatically", desc: "Monthly financial statements generated without any manual work." },
            ].map((item, i) => (
              <div key={i} className="relative group">
                {/* Connection line */}
                {i < 3 && (
                  <div className="hidden lg:block absolute top-12 left-[60%] w-full h-[2px] bg-gradient-to-r from-sl-gold/40 to-transparent" />
                )}
                
                <div className="bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.08] rounded-2xl p-8 hover:border-sl-gold/30 transition-all duration-300 h-full">
                  {/* Step number */}
                  <div className="w-16 h-16 bg-gradient-to-br from-sl-gold to-sl-gold-dark rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-sl-gold/20">
                    <span className="font-bold text-[#0a0f0d] text-xl">{item.step}</span>
                  </div>
                  
                  <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mb-5">
                    <item.icon className="w-6 h-6 text-sl-gold" />
                  </div>
                  <h3 className="font-bold text-xl text-white mb-3">{item.title}</h3>
                  <p className="text-white/40 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Inline CTA */}
          <div className="mt-16 flex justify-center">
            <div className="inline-flex items-center gap-6 bg-white/[0.03] border border-white/10 rounded-full px-3 py-3 pl-8">
              <span className="text-white/60 font-medium">Ready to simplify your operations?</span>
              <Button className="bg-gradient-to-r from-sl-gold to-sl-gold-dark hover:from-sl-gold-dark hover:to-sl-gold text-[#0a0f0d] font-bold rounded-full px-8 h-12 shadow-lg shadow-sl-gold/20">
                Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid - Intense dark with gold highlights */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#080c0a] via-[#0d1915] to-[#080c0a]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <span className="inline-block text-sl-gold font-bold text-sm tracking-[0.2em] uppercase mb-6">
              FEATURES
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-white leading-tight mb-6">
              Everything You Need to<br />
              <span className="bg-gradient-to-r from-sl-gold to-sl-gold-dark bg-clip-text text-transparent">Professionalize Payments</span>
            </h2>
            <p className="text-xl text-white/40 max-w-3xl mx-auto">
              StandLedger replaces fragmented tools with one integrated platform designed for installment-based property sales.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5 max-w-5xl mx-auto">
            {[
              { icon: FileText, title: "Monthly Statement Engine", desc: "Immutable snapshots of every customer's account, generated automatically." },
              { icon: Users, title: "Customer Payment Portals", desc: "Secure online access for buyers to view balances and payment history." },
              { icon: BarChart3, title: "Multi-Stand Support", desc: "Customers with multiple plots see a unified view while you manage each stand separately." },
              { icon: FileCheck, title: "Agreement of Sale Access", desc: "Upload and share signed agreements through the secure portal." },
              { icon: AlertTriangle, title: "Overdue Tracking", desc: "Automatic flagging of late payments with configurable grace periods." },
              { icon: MessageSquare, title: "WhatsApp-Friendly Support", desc: "Integration points designed for the way your customers communicate." },
              { icon: BarChart3, title: "Director Reporting", desc: "Executive dashboards showing collection rates and project health." },
              { icon: Shield, title: "Compliance Ready", desc: "Audit trails and documentation that meet financial reporting standards." },
            ].map((item, i) => (
              <div 
                key={i} 
                className="group bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] rounded-2xl p-8 hover:border-sl-gold/40 hover:bg-sl-gold/[0.02] transition-all duration-300"
              >
                <div className="w-14 h-14 bg-sl-gold/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-sl-gold/20 transition-colors">
                  <item.icon className="w-7 h-7 text-sl-gold" />
                </div>
                <h3 className="font-bold text-xl text-sl-gold mb-3">{item.title}</h3>
                <p className="text-white/50 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case Study - Dark dramatic testimonial */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-[#0a0f0d] relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-sl-gold/5 rounded-full blur-[150px]" />
        
        <div className="max-w-7xl mx-auto relative">
          <div className="mb-16">
            <span className="inline-block text-sl-gold font-bold text-sm tracking-[0.2em] uppercase mb-6">
              CASE STUDY
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-white leading-tight">
              How LakeCity Estates<br />
              <span className="text-white/40">Transformed Their Operations</span>
            </h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xl text-white/70 mb-6">
                <span className="font-bold text-white">The Challenge:</span>{" "}
                LakeCity Estates, a leading residential developer in Harare, was managing 400+ installment customers across 
                multiple projects. Their diaspora buyers were demanding professional financial documentation.
              </p>
              <p className="text-lg text-white/50 mb-10">
                Manual spreadsheets and WhatsApp threads weren't cutting it. Directors were spending entire weekends reconciling payments.
              </p>

              <div className="space-y-4 mb-10">
                {[
                  "Monthly bank-grade statements for every buyer",
                  "Reduced disputes by 85%",
                  "Improved customer trust and retention",
                  "Professional reporting for directors",
                  "Zero manual statement generation",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <CheckCircle className="w-6 h-6 text-sl-gold shrink-0" />
                    <span className="font-medium text-white/80 text-lg">{item}</span>
                  </div>
                ))}
              </div>

              <Button 
                size="lg"
                className="bg-gradient-to-r from-sl-gold to-sl-gold-dark hover:from-sl-gold-dark hover:to-sl-gold text-[#0a0f0d] font-bold rounded-xl px-10 h-14 shadow-xl shadow-sl-gold/25"
              >
                Get Similar Results
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>

            {/* Testimonial card */}
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-br from-sl-gold/20 via-sl-gold/10 to-transparent rounded-3xl blur-xl" />
              <div className="relative bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 rounded-3xl overflow-hidden">
                <div className="p-10">
                  {/* Quote mark */}
                  <div className="text-sl-gold text-8xl font-serif leading-none mb-4 opacity-50">"</div>
                  
                  <p className="text-2xl sm:text-3xl font-serif text-white leading-relaxed mb-10">
                    LakeCity now issues a monthly statement to every buyer — <span className="text-sl-gold">automatically</span>. Our diaspora clients 
                    finally have the transparency they were asking for.
                  </p>

                  <div className="flex items-center gap-4 pb-10 border-b border-white/10">
                    <div className="w-16 h-16 bg-gradient-to-br from-sl-gold to-sl-gold-dark rounded-full flex items-center justify-center shadow-lg">
                      <span className="font-bold text-[#0a0f0d] text-xl">LC</span>
                    </div>
                    <div>
                      <p className="font-bold text-white text-lg">LakeCity Estates</p>
                      <p className="text-white/50">Harare, Zimbabwe</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-6 mt-10">
                    <div className="text-center">
                      <p className="text-4xl font-bold text-white">400+</p>
                      <p className="text-sm text-white/40 mt-1">Customers</p>
                    </div>
                    <div className="text-center">
                      <p className="text-4xl font-bold text-sl-gold">85%</p>
                      <p className="text-sm text-white/40 mt-1">Less Disputes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-4xl font-bold text-white">0</p>
                      <p className="text-sm text-white/40 mt-1">Manual Work</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing - Dark with featured gold border */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 bg-[#080c0a]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <span className="inline-block text-sl-gold font-bold text-sm tracking-[0.2em] uppercase mb-6">
              TRANSPARENT PRICING
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-white leading-tight mb-6">
              You Only Pay As Your<br />
              <span className="bg-gradient-to-r from-sl-gold to-sl-gold-dark bg-clip-text text-transparent">Project Grows</span>
            </h2>
            <p className="text-xl text-white/40 max-w-2xl mx-auto">
              No hidden fees. No long-term contracts. Pricing that scales with your success.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* One-Time Setup */}
            <div className="bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.08] rounded-3xl p-8 hover:border-white/20 transition-all">
              <div className="text-center mb-8">
                <span className="inline-block bg-white/10 text-white/70 px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
                  One-Time
                </span>
                <h3 className="text-xl font-bold text-white mb-4">Setup Fee</h3>
                <div className="text-5xl font-bold text-white">
                  $1,500
                </div>
                <p className="text-white/30 mt-2">– $5,000 USD</p>
              </div>
              <div className="space-y-4 pt-8 border-t border-white/10">
                {[
                  "White-label branding setup",
                  "Platform configuration",
                  "Historical data import",
                  "Team training sessions",
                  "Go-live support",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-white/40 shrink-0" />
                    <span className="text-white/60">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly Platform Fee - Featured */}
            <div className="relative">
              <div className="absolute -inset-[1px] bg-gradient-to-b from-sl-gold via-sl-gold-dark to-sl-gold/50 rounded-3xl" />
              <div className="relative bg-[#080c0a] rounded-3xl p-8">
                <div className="absolute -top-5 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-sl-gold to-sl-gold-dark text-[#0a0f0d] px-6 py-2 rounded-full text-sm font-bold shadow-xl">
                    Most Popular
                  </span>
                </div>
                <div className="text-center mb-8 pt-4">
                  <span className="inline-block bg-sl-gold/20 text-sl-gold px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
                    Monthly
                  </span>
                  <h3 className="text-xl font-bold text-white mb-4">Platform Fee</h3>
                  <div className="text-5xl font-bold text-sl-gold">
                    $250
                  </div>
                  <p className="text-white/30 mt-2">– $750 USD / month</p>
                </div>
                <div className="space-y-4 pt-8 border-t border-white/10">
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
                      <span className="text-white/70">{item}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-white/30 mt-6 text-center">
                  Based on customer count & project size
                </p>
              </div>
            </div>

            {/* Per-Stand Fee */}
            <div className="bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.08] rounded-3xl p-8 hover:border-white/20 transition-all">
              <div className="text-center mb-8">
                <span className="inline-block bg-white/10 text-white/70 px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
                  Per Stand
                </span>
                <h3 className="text-xl font-bold text-white mb-4">Usage Fee</h3>
                <div className="text-5xl font-bold text-white">
                  $1.50
                </div>
                <p className="text-white/30 mt-2">– $3.00 USD / stand / month</p>
              </div>
              <div className="space-y-4 pt-8 border-t border-white/10">
                {[
                  "Individual stand tracking",
                  "Payment history per stand",
                  "Statement generation",
                  "Portal access for buyer",
                  "Support case handling",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-white/40 shrink-0" />
                    <span className="text-white/60">{item}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/30 mt-6 text-center">
                Only active stands are billed
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who It's For - Dark split section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-[#0a0f0d]">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12">
            <div>
              <span className="inline-block text-sl-gold font-bold text-sm tracking-[0.2em] uppercase mb-6">
                PERFECT FOR
              </span>
              <h2 className="text-3xl sm:text-4xl font-serif font-bold text-white mb-10">Built for Growing Developers</h2>
              <div className="space-y-4">
                {[
                  "Land developers selling on installment payment plans",
                  "Construction projects funded by diaspora buyers",
                  "Housing estates with 50+ active customers",
                  "Companies scaling beyond Excel spreadsheets",
                  "Directors who need visibility into cash flow",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-5 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-sl-gold/30 transition-colors">
                    <CheckCircle className="w-6 h-6 text-sl-gold shrink-0" />
                    <span className="text-white/80 font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className="inline-block text-red-400 font-bold text-sm tracking-[0.2em] uppercase mb-6">
                NOT DESIGNED FOR
              </span>
              <h2 className="text-3xl sm:text-4xl font-serif font-bold text-white mb-10">May Not Be the Right Fit</h2>
              <div className="space-y-4">
                {[
                  "Cash-only property sales with no installments",
                  "One-off transactions without recurring payments",
                  "Projects with fewer than 20 customers",
                  "Companies not ready to formalize their processes",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-5 bg-red-500/[0.03] border border-red-500/10 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                      <X className="w-4 h-4 text-red-400" />
                    </span>
                    <span className="text-white/60">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section - Intense gradient */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d1915] via-[#0a0f0d] to-[#0d1915]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.1),transparent_70%)]" />
        
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-white mb-8">
            Ready to Professionalize<br />Your Payment Operations?
          </h2>
          <p className="text-xl text-white/50 mb-12 max-w-2xl mx-auto">
            Join developers who've transformed their customer experience with StandLedger.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-sl-gold to-sl-gold-dark hover:from-sl-gold-dark hover:to-sl-gold text-[#0a0f0d] font-bold text-lg px-12 h-16 rounded-xl shadow-2xl shadow-sl-gold/30 transition-all hover:scale-105"
            >
              Request a Demo
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-2 border-white/20 bg-white/5 text-white hover:bg-white/10 font-semibold text-lg px-12 h-16 rounded-xl"
              onClick={() => window.open(whatsappLink, '_blank')}
            >
              <MessageSquare className="w-5 h-5 mr-2" />
              Chat on WhatsApp
            </Button>
          </div>
          <p className="text-white/30 text-sm">
            📞 +263 78 300 2138 • ✉️ info@standsledger.io
          </p>
        </div>
      </section>

      {/* Footer - Near black */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-[#050807] border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-sl-gold to-sl-gold-dark rounded-lg flex items-center justify-center">
                <span className="text-[#0a0f0d] font-bold text-xl">S</span>
              </div>
              <span className="text-xl font-bold text-white tracking-tight">StandLedger</span>
            </div>
            <p className="text-white/30 text-sm text-center">
              © {new Date().getFullYear()} StandLedger. Professional financial infrastructure for property developers.
            </p>
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <span>+263 78 300 2138</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default StandLedgerLanding;
