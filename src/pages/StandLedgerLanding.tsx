import { Button } from "@/components/ui/button";
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
  X,
  Landmark,
  Globe
} from "lucide-react";
import { useState } from "react";

const StandLedgerLanding = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const whatsappNumber = "263783002138";
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hi, I'd like to learn more about StandLedger.")}`;

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0f0d] font-sans">
      {/* Navigation */}
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
              <Button 
                className="bg-sl-gold hover:bg-sl-gold-dark text-[#0a0f0d] font-bold px-6"
                onClick={() => window.open(whatsappLink, '_blank')}
              >
                Get in Touch
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
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#0a0f0d] border-t border-white/5 py-4 px-4 space-y-3">
            <button onClick={() => scrollToSection('problem')} className="block w-full text-left py-2 text-white/70 font-medium">The Problem</button>
            <button onClick={() => scrollToSection('how-it-works')} className="block w-full text-left py-2 text-white/70 font-medium">How It Works</button>
            <button onClick={() => scrollToSection('features')} className="block w-full text-left py-2 text-white/70 font-medium">Features</button>
            <button onClick={() => scrollToSection('pricing')} className="block w-full text-left py-2 text-white/70 font-medium">Pricing</button>
            <Button 
              className="w-full bg-sl-gold hover:bg-sl-gold-dark text-[#0a0f0d] font-bold mt-4"
              onClick={() => window.open(whatsappLink, '_blank')}
            >
              Get in Touch
            </Button>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f0d] via-[#0d1915] to-[#0a0f0d]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-sl-gold/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-sl-green/10 rounded-full blur-[120px]" />
        
        <div className="max-w-6xl mx-auto relative pt-12 pb-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full px-6 py-3 mb-10">
              <span className="w-2.5 h-2.5 bg-sl-gold rounded-full animate-pulse" />
              <span className="text-white/80 text-sm font-semibold tracking-wide uppercase">Purpose-Built for Property Developers</span>
            </div>
            
            <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-serif font-bold text-white leading-[1.05] mb-8 tracking-tight">
              Installment Payments,{" "}
              <span className="bg-gradient-to-r from-sl-gold via-sl-gold to-sl-gold-dark bg-clip-text text-transparent">
                Finally Managed
              </span>
            </h1>
            
            <p className="text-xl sm:text-2xl text-white/50 mb-12 max-w-3xl mx-auto leading-relaxed font-light">
              StandLedger gives land and property developers a single platform to track 
              installment payments, generate monthly statements, and give buyers 
              transparent access to their accounts.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-sl-gold to-sl-gold-dark hover:from-sl-gold-dark hover:to-sl-gold text-[#0a0f0d] font-bold text-lg px-10 h-16 rounded-xl shadow-2xl shadow-sl-gold/30 transition-all hover:scale-105"
                onClick={() => window.open(whatsappLink, '_blank')}
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

            <div className="flex flex-wrap justify-center gap-6 mb-12">
              {[
                "Automated monthly statements",
                "Secure customer portals",
                "Real-time payment tracking"
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full px-5 py-2.5">
                  <CheckCircle className="w-5 h-5 text-sl-gold" />
                  <span className="text-white/70 font-medium">{feature}</span>
                </div>
              ))}
            </div>

            <div className="inline-flex items-center gap-4 text-white/30 text-sm">
              <span className="w-12 h-[1px] bg-gradient-to-r from-transparent to-white/20" />
              Trusted by Warwickshire Pvt Ltd &amp; LakeCity development projects
              <span className="w-12 h-[1px] bg-gradient-to-l from-transparent to-white/20" />
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section id="problem" className="py-24 px-4 sm:px-6 lg:px-8 bg-[#080c0a]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <span className="inline-block text-sl-gold font-bold text-sm tracking-[0.2em] uppercase mb-6">
              THE PROBLEM
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-white leading-tight mb-6">
              Buyers Are Paying —<br />
              <span className="text-white/40">But Nobody Can Prove It</span>
            </h2>
            <p className="text-xl text-white/40 max-w-3xl mx-auto">
              Installment-based property sales generate hundreds of transactions a month. 
              Without proper tooling, reconciliation becomes a full-time job.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {[
              { icon: Table, title: "Spreadsheet Overload", desc: "Payment data scattered across tabs, versions, and shared drives — one bad edit breaks everything." },
              { icon: MessageCircle, title: "Proof-of-Payment via WhatsApp", desc: "Screenshots and voice notes instead of structured receipts. Impossible to audit." },
              { icon: Clock, title: "Missed Follow-Ups", desc: "No automated alerts when payments are late. Arrears grow before anyone notices." },
              { icon: HelpCircle, title: "Customer Disputes", desc: "Buyers question their balance with no formal statement to reference." },
              { icon: FileX, title: "No Statements Issued", desc: "Diaspora buyers expect professional monthly statements — most developers have none." },
              { icon: AlertTriangle, title: "Director Blind Spots", desc: "Leadership can't see collection rates, overdue accounts, or cash-flow trends at a glance." },
            ].map((item, i) => (
              <div 
                key={i} 
                className="bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] rounded-2xl p-8 hover:border-red-500/30 hover:bg-red-500/[0.02] transition-all duration-300"
              >
                <div className="w-14 h-14 bg-red-500/10 rounded-xl flex items-center justify-center mb-6">
                  <item.icon className="w-7 h-7 text-red-400" />
                </div>
                <h3 className="font-bold text-xl text-white mb-3">{item.title}</h3>
                <p className="text-white/40 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8 bg-[#0a0f0d] relative overflow-hidden">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[400px] h-[600px] bg-sl-green/5 rounded-full blur-[100px]" />
        
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-20">
            <span className="inline-block text-sl-gold font-bold text-sm tracking-[0.2em] uppercase mb-6">
              HOW IT WORKS
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-white leading-tight mb-6">
              Your Spreadsheet Becomes a{" "}
              <span className="bg-gradient-to-r from-sl-gold to-sl-gold-dark bg-clip-text text-transparent">Platform</span>
            </h2>
            <p className="text-xl text-white/40 max-w-2xl mx-auto">
              We connect to your existing Google Sheet — no data migration, no system rebuild.
            </p>
          </div>

          <div className="grid lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {[
              { step: "01", icon: FileText, title: "Connect Your Sheet", desc: "Share your existing Google Sheet. We read your collection schedule as the source of truth." },
              { step: "02", icon: Settings, title: "We Configure the Platform", desc: "Our team maps your columns, payment plans, and customer data into StandLedger." },
              { step: "03", icon: Users, title: "Buyers Get Portal Access", desc: "Each customer receives a secure login to view their balance, payments, and documents." },
              { step: "04", icon: ClipboardCheck, title: "Statements Run Automatically", desc: "Monthly financial summaries are generated and available — no manual work required." },
            ].map((item, i) => (
              <div key={i} className="relative">
                {i < 3 && (
                  <div className="hidden lg:block absolute top-12 left-[60%] w-full h-[2px] bg-gradient-to-r from-sl-gold/40 to-transparent" />
                )}
                
                <div className="bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.08] rounded-2xl p-8 hover:border-sl-gold/30 transition-all duration-300 h-full">
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

          <div className="mt-16 flex justify-center">
            <div className="inline-flex items-center gap-6 bg-white/[0.03] border border-white/10 rounded-full px-3 py-3 pl-8">
              <span className="text-white/60 font-medium">Ready to get started?</span>
              <Button 
                className="bg-gradient-to-r from-sl-gold to-sl-gold-dark hover:from-sl-gold-dark hover:to-sl-gold text-[#0a0f0d] font-bold rounded-full px-8 h-12 shadow-lg shadow-sl-gold/20"
                onClick={() => window.open(whatsappLink, '_blank')}
              >
                Talk to Us
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#080c0a] via-[#0d1915] to-[#080c0a]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <span className="inline-block text-sl-gold font-bold text-sm tracking-[0.2em] uppercase mb-6">
              PLATFORM
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-white leading-tight mb-6">
              What's Included
            </h2>
            <p className="text-xl text-white/40 max-w-3xl mx-auto">
              One integrated platform replacing spreadsheets, WhatsApp threads, and manual reconciliation.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5 max-w-5xl mx-auto">
            {[
              { icon: FileText, title: "Monthly Statement Engine", desc: "Automated account summaries generated each month — opening balance, payments received, closing balance." },
              { icon: Users, title: "Customer Payment Portal", desc: "Secure login for each buyer to view their payment history, outstanding balance, and agreement documents." },
              { icon: BarChart3, title: "Multi-Stand Support", desc: "Customers owning multiple plots see all their accounts in one place. You manage each stand independently." },
              { icon: FileCheck, title: "Agreement of Sale Access", desc: "Upload signed agreements and make them available through the customer portal." },
              { icon: AlertTriangle, title: "Overdue & Arrears Tracking", desc: "Automatic detection of late payments with configurable grace periods and status indicators." },
              { icon: MessageSquare, title: "Support Request System", desc: "Customers can raise queries directly from the portal — tracked, categorised, and resolved." },
              { icon: Landmark, title: "Executive Reporting", desc: "Collection rate dashboards, revenue summaries, and geographic breakdowns for leadership." },
              { icon: Shield, title: "Audit Trail & Compliance", desc: "Every action is logged. Full history of payments, edits, and user activity for accountability." },
            ].map((item, i) => (
              <div 
                key={i} 
                className="bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] rounded-2xl p-8 hover:border-sl-gold/40 hover:bg-sl-gold/[0.02] transition-all duration-300"
              >
                <div className="w-14 h-14 bg-sl-gold/10 rounded-xl flex items-center justify-center mb-6">
                  <item.icon className="w-7 h-7 text-sl-gold" />
                </div>
                <h3 className="font-bold text-xl text-sl-gold mb-3">{item.title}</h3>
                <p className="text-white/50 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case Study */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-[#0a0f0d] relative overflow-hidden">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-sl-gold/5 rounded-full blur-[150px]" />
        
        <div className="max-w-7xl mx-auto relative">
          <div className="mb-16">
            <span className="inline-block text-sl-gold font-bold text-sm tracking-[0.2em] uppercase mb-6">
              IN PRODUCTION
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-white leading-tight">
              Live with Warwickshire<br />
              <span className="text-white/40">&amp; LakeCity Projects</span>
            </h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xl text-white/70 mb-6">
                <span className="font-bold text-white">The situation:</span>{" "}
                Warwickshire Pvt Ltd manages hundreds of installment buyers across multiple LakeCity residential phases — 
                many purchasing from the diaspora. Buyers needed professional account access and formal documentation.
              </p>
              <p className="text-lg text-white/50 mb-10">
                StandLedger now powers their customer portal, generates monthly statements, and provides the internal 
                team with real-time visibility into collections and arrears.
              </p>

              <div className="space-y-4 mb-10">
                {[
                  "Monthly statements generated automatically for every buyer",
                  "Customers log in to view balances and payment history",
                  "Support requests handled through the portal",
                  "Executive reporting dashboards for directors",
                  "Multi-stand accounts supported out of the box",
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
                onClick={() => window.open(whatsappLink, '_blank')}
              >
                See It in Action
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>

            {/* Testimonial */}
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-br from-sl-gold/20 via-sl-gold/10 to-transparent rounded-3xl blur-xl" />
              <div className="relative bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 rounded-3xl overflow-hidden">
                <div className="p-10">
                  <div className="text-sl-gold text-8xl font-serif leading-none mb-4 opacity-50">"</div>
                  
                  <p className="text-2xl sm:text-3xl font-serif text-white leading-relaxed mb-10">
                    Every buyer now receives a monthly statement — <span className="text-sl-gold">automatically</span>. 
                    Our diaspora clients finally have the transparency they were asking for.
                  </p>

                  <div className="flex items-center gap-4 pb-10 border-b border-white/10">
                    <div className="w-16 h-16 bg-gradient-to-br from-sl-gold to-sl-gold-dark rounded-full flex items-center justify-center shadow-lg">
                      <span className="font-bold text-[#0a0f0d] text-xl">W</span>
                    </div>
                    <div>
                      <p className="font-bold text-white text-lg">Warwickshire Pvt Ltd</p>
                      <p className="text-white/50">Harare, Zimbabwe</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-6 mt-10">
                    <div className="text-center">
                      <p className="text-4xl font-bold text-white">400+</p>
                      <p className="text-sm text-white/40 mt-1">Active Buyers</p>
                    </div>
                    <div className="text-center">
                      <p className="text-4xl font-bold text-sl-gold">24/7</p>
                      <p className="text-sm text-white/40 mt-1">Portal Access</p>
                    </div>
                    <div className="text-center">
                      <p className="text-4xl font-bold text-white">0</p>
                      <p className="text-sm text-white/40 mt-1">Manual Statements</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 bg-[#080c0a]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <span className="inline-block text-sl-gold font-bold text-sm tracking-[0.2em] uppercase mb-6">
              PRICING
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-white leading-tight mb-6">
              Scales with Your{" "}
              <span className="bg-gradient-to-r from-sl-gold to-sl-gold-dark bg-clip-text text-transparent">Portfolio</span>
            </h2>
            <p className="text-xl text-white/40 max-w-2xl mx-auto">
              Simple, transparent pricing. No hidden fees, no long-term lock-in.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Setup */}
            <div className="bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.08] rounded-3xl p-8 hover:border-white/20 transition-all">
              <div className="text-center mb-8">
                <span className="inline-block bg-white/10 text-white/70 px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
                  One-Time
                </span>
                <h3 className="text-xl font-bold text-white mb-4">Setup &amp; Onboarding</h3>
                <div className="text-5xl font-bold text-white">
                  $1,500
                </div>
                <p className="text-white/30 mt-2">– $5,000 USD</p>
              </div>
              <div className="space-y-4 pt-8 border-t border-white/10">
                {[
                  "Platform configuration",
                  "Data import from your sheet",
                  "Branded customer portal",
                  "Team training",
                  "Go-live support",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-white/40 shrink-0" />
                    <span className="text-white/60">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly — Featured */}
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
                    "Support request system",
                    "Executive reporting",
                    "Ongoing support",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-sl-gold shrink-0" />
                      <span className="text-white/70">{item}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-white/30 mt-6 text-center">
                  Based on customer count &amp; project complexity
                </p>
              </div>
            </div>

            {/* Per-Stand */}
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

      {/* Who It's For */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-[#0a0f0d]">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12">
            <div>
              <span className="inline-block text-sl-gold font-bold text-sm tracking-[0.2em] uppercase mb-6">
                IDEAL FOR
              </span>
              <h2 className="text-3xl sm:text-4xl font-serif font-bold text-white mb-10">Built for Property Developers</h2>
              <div className="space-y-4">
                {[
                  "Land developers selling stands on installment plans",
                  "Housing projects with diaspora buyer bases",
                  "Estates with 50+ active paying customers",
                  "Companies outgrowing spreadsheet-based accounting",
                  "Directors who need financial visibility at a glance",
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
                NOT THE RIGHT FIT
              </span>
              <h2 className="text-3xl sm:text-4xl font-serif font-bold text-white mb-10">Probably Not For You If…</h2>
              <div className="space-y-4">
                {[
                  "You sell property on a cash-only, full-payment basis",
                  "You have fewer than 20 active customers",
                  "You don't use Google Sheets to track payments",
                  "You're not ready to formalise your payment processes",
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

      {/* CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d1915] via-[#0a0f0d] to-[#0d1915]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.1),transparent_70%)]" />
        
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-white mb-8">
            Ready to Professionalise<br />Your Payment Operations?
          </h2>
          <p className="text-xl text-white/50 mb-12 max-w-2xl mx-auto">
            Let's talk about how StandLedger can work for your development project.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-sl-gold to-sl-gold-dark hover:from-sl-gold-dark hover:to-sl-gold text-[#0a0f0d] font-bold text-lg px-12 h-16 rounded-xl shadow-2xl shadow-sl-gold/30 transition-all hover:scale-105"
              onClick={() => window.open(whatsappLink, '_blank')}
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
            +263 78 300 2138 · info@standledger.io
          </p>
        </div>
      </section>

      {/* Footer */}
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
              © {new Date().getFullYear()} StandLedger. Financial infrastructure for property developers.
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
