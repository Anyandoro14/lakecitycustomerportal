import { useState } from "react";
import { Lock, Shield, CreditCard, Building2, ArrowRight, Check, ChevronDown, Zap, Globe, Smartphone, Wallet, ArrowUpRight, Eye, EyeOff, DollarSign, Users, BarChart3, Layers, MapPin, Landmark, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import logoWordmark from "@/assets/logo-wordmark-sea-green.svg";

const ACCESS_PASSWORD = "LakeCity2025!Pay";

/* ─────────────────── Password Gate ─────────────────── */
const PasswordGate = ({ onUnlock }: { onUnlock: () => void }) => {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === ACCESS_PASSWORD) onUnlock();
    else setError(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(160,70%,8%)] via-[hsl(160,50%,12%)] to-[hsl(160,30%,18%)] flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <img src={logoWordmark} alt="StandLedger" className="h-10 mx-auto mb-6 brightness-0 invert" />
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-white/70 text-xs font-medium tracking-wider uppercase mb-4">
            <Lock className="w-3 h-3" /> Confidential Document
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Payment Gateway Integration</h1>
          <p className="text-white/50 text-sm">This document is password-protected. Enter credentials to continue.</p>
        </div>
        <form onSubmit={submit}>
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
            <label className="text-white/60 text-xs font-medium uppercase tracking-wider mb-2 block">Access Password</label>
            <div className="relative mb-4">
              <Input
                type={showPw ? "text" : "password"}
                value={pw}
                onChange={(e) => { setPw(e.target.value); setError(false); }}
                placeholder="Enter password"
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 h-12 pr-10"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <p className="text-red-400 text-xs mb-3">Incorrect password. Please try again.</p>}
            <Button type="submit" className="w-full h-12 bg-white text-[hsl(160,70%,15%)] hover:bg-white/90 font-semibold text-sm">
              <Shield className="w-4 h-4 mr-2" /> Unlock Document
            </Button>
          </div>
        </form>
        <p className="text-white/30 text-xs text-center mt-6">Shared between Lake City Development & Integration Partner only.</p>
      </div>
    </div>
  );
};

/* ─────────────── Section Divider ─────────────── */
const SectionDivider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-6 my-20">
    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[hsl(160,70%,15%)]/20 to-transparent" />
    <span className="text-base md:text-lg font-bold uppercase tracking-[0.25em] text-[hsl(160,70%,15%)]/40">{label}</span>
    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[hsl(160,70%,15%)]/20 to-transparent" />
  </div>
);

/* ─────────────── Stat Card ─────────────── */
const StatCard = ({ icon: Icon, value, label }: { icon: any; value: string; label: string }) => (
  <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-6 text-center">
    <div className="w-12 h-12 rounded-xl bg-[hsl(160,70%,15%)]/10 flex items-center justify-center mx-auto mb-3">
      <Icon className="w-6 h-6 text-[hsl(160,70%,15%)]" />
    </div>
    <div className="text-2xl font-bold text-[hsl(160,70%,15%)]">{value}</div>
    <div className="text-xs text-[hsl(160,70%,15%)]/50 mt-1">{label}</div>
  </div>
);

/* ─────────────── Phase Card ─────────────── */
const PhaseCard = ({ phase, title, subtitle, items, color, active }: {
  phase: string; title: string; subtitle: string; items: string[]; color: string; active?: boolean;
}) => (
  <div className={`relative rounded-3xl border-2 p-8 transition-all ${active ? `border-[${color}] shadow-xl shadow-[${color}]/10` : "border-[hsl(160,10%,90%)]"}`}>
    {active && (
      <div className="absolute -top-3 left-8 bg-[hsl(160,70%,15%)] text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
        Recommended Start
      </div>
    )}
    <div className="flex items-start gap-4 mb-6">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0`} style={{ background: color }}>
        {phase}
      </div>
      <div>
        <h3 className="text-2xl font-bold text-[hsl(160,70%,15%)]">{title}</h3>
        <p className="text-base text-[hsl(160,70%,15%)]/50 mt-0.5">{subtitle}</p>
      </div>
    </div>
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-base text-[hsl(160,70%,15%)]/70">
          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </div>
);

/* ─────────────── Checkout Mockup ─────────────── */
const CheckoutMockup = () => {
  const [step, setStep] = useState<"details" | "method" | "confirm">("details");
  const [method, setMethod] = useState<string | null>(null);

  return (
    <div className="max-w-md mx-auto">
      {/* Phone Frame */}
      <div className="bg-[hsl(160,70%,8%)] rounded-[2.5rem] p-3 shadow-2xl shadow-black/30">
        <div className="bg-white rounded-[2rem] overflow-hidden">
          {/* Status bar mockup */}
          <div className="bg-[hsl(160,70%,15%)] px-6 py-3 flex items-center justify-between">
            <img src={logoWordmark} alt="StandLedger" className="h-5 brightness-0 invert" />
            <span className="text-white/60 text-[10px] font-medium">SECURE CHECKOUT</span>
          </div>

          {/* Progress Steps */}
          <div className="px-6 pt-5 pb-3">
            <div className="flex items-center gap-2">
              {["Details", "Method", "Confirm"].map((s, i) => {
                const stepMap = { details: 0, method: 1, confirm: 2 };
                const current = stepMap[step];
                const isActive = i <= current;
                return (
                  <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className={`h-1.5 w-full rounded-full transition-all ${isActive ? "bg-[hsl(160,70%,15%)]" : "bg-gray-200"}`} />
                    <span className={`text-[10px] font-medium ${isActive ? "text-[hsl(160,70%,15%)]" : "text-gray-400"}`}>{s}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step Content */}
          <div className="px-6 pb-6 min-h-[380px]">
            {step === "details" && (
              <div className="space-y-4 pt-4">
                <h2 className="text-lg font-bold text-[hsl(160,70%,15%)]">Payment Details</h2>
                <p className="text-xs text-gray-500">Enter your stand information to proceed with payment.</p>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Full Name</label>
                  <Input defaultValue="John Moyo" className="h-11 bg-gray-50 border-gray-200" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Stand Number</label>
                  <Input defaultValue="SL-1042" className="h-11 bg-gray-50 border-gray-200" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Payment Amount (USD)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input defaultValue="250.00" className="h-11 bg-gray-50 border-gray-200 pl-9 text-lg font-semibold" />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Maximum single transaction: $999.00</p>
                </div>
                <Button onClick={() => setStep("method")} className="w-full h-11 bg-[hsl(160,70%,15%)] hover:bg-[hsl(160,70%,20%)] text-white font-semibold mt-2">
                  Continue <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}

            {step === "method" && (
              <div className="space-y-3 pt-4">
                <h2 className="text-lg font-bold text-[hsl(160,70%,15%)]">Payment Method</h2>
                <p className="text-xs text-gray-500 mb-2">Select how you'd like to pay.</p>
                {[
                  { id: "card", icon: CreditCard, label: "Credit / Debit Card", desc: "Visa, Mastercard" },
                  { id: "bank", icon: Building2, label: "Bank Transfer", desc: "Local ZWL / USD transfer" },
                  { id: "wire", icon: Globe, label: "Wire Transfer", desc: "International wire (SWIFT)" },
                  { id: "mobile", icon: Smartphone, label: "Mobile Money", desc: "EcoCash, OneMoney" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${method === m.id ? "border-[hsl(160,70%,15%)] bg-[hsl(160,70%,15%)]/5" : "border-gray-200 hover:border-gray-300"}`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${method === m.id ? "bg-[hsl(160,70%,15%)] text-white" : "bg-gray-100 text-gray-500"}`}>
                      <m.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[hsl(160,70%,15%)]">{m.label}</div>
                      <div className="text-[11px] text-gray-400">{m.desc}</div>
                    </div>
                    {method === m.id && <Check className="w-5 h-5 text-[hsl(160,70%,15%)] ml-auto" />}
                  </button>
                ))}
                <div className="flex gap-3 mt-3">
                  <Button variant="outline" onClick={() => setStep("details")} className="flex-1 h-11">Back</Button>
                  <Button onClick={() => method && setStep("confirm")} disabled={!method} className="flex-1 h-11 bg-[hsl(160,70%,15%)] hover:bg-[hsl(160,70%,20%)] text-white font-semibold">
                    Continue <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {step === "confirm" && (
              <div className="space-y-4 pt-4">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                    <Shield className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h2 className="text-lg font-bold text-[hsl(160,70%,15%)]">Confirm Payment</h2>
                  <p className="text-xs text-gray-500">Review your payment details below.</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  {[
                    ["Name", "John Moyo"],
                    ["Stand", "SL-1042"],
                    ["Method", method === "card" ? "Credit Card" : method === "bank" ? "Bank Transfer" : method === "wire" ? "Wire Transfer" : "Mobile Money"],
                    ["Amount", "$250.00"],
                    ["Fee (~4%)", "$10.00"],
                    ["Total", "$260.00"],
                  ].map(([k, v], i) => (
                    <div key={i} className={`flex justify-between text-sm ${i === 5 ? "font-bold text-[hsl(160,70%,15%)] border-t border-gray-200 pt-3" : "text-gray-600"}`}>
                      <span>{k}</span><span>{v}</span>
                    </div>
                  ))}
                </div>
                <Button className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base">
                  <Lock className="w-4 h-4 mr-2" /> Pay $260.00
                </Button>
                <p className="text-[10px] text-gray-400 text-center">Secured by 256-bit encryption. Your data is never stored.</p>
                <button onClick={() => { setStep("details"); setMethod(null); }} className="text-xs text-[hsl(160,70%,15%)] underline mx-auto block">
                  Start Over
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─────────────── Main Proposal Page ─────────────── */
const PaymentGatewayProposal = () => {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="min-h-screen bg-[hsl(0,0%,98%)]">
      {/* Hero */}
      <header className="relative bg-gradient-to-br from-[hsl(160,70%,8%)] via-[hsl(160,50%,12%)] to-[hsl(160,30%,20%)] overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, hsl(160,70%,40%) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(38,70%,55%) 0%, transparent 40%)" }} />
        <div className="max-w-6xl mx-auto px-6 py-20 relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <img src={logoWordmark} alt="StandLedger" className="h-8 brightness-0 invert" />
            <span className="text-white/30 text-xl">×</span>
            <span className="text-white/60 text-base font-medium tracking-wide">Payment Gateway Partner</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-white leading-tight max-w-3xl">
            Payment Gateway<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-200">Integration Proposal</span>
          </h1>
          <p className="text-white/50 text-xl mt-6 max-w-2xl leading-relaxed">
            A phased approach to enabling seamless land instalment payments for 70 customers in Zimbabwe, 
            processing transactions up to $999 per payment.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            {["Confidential", "February 2026", "v1.0"].map((tag) => (
              <span key={tag} className="bg-white/10 border border-white/10 text-white/70 text-sm font-medium px-4 py-1.5 rounded-full">{tag}</span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        {/* ── About Lake City ── */}
        <SectionDivider label="About Lake City" />
        <div className="grid md:grid-cols-2 gap-12 items-start mb-16">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold text-[hsl(160,70%,15%)] mb-4">Lake City Development</h2>
            <p className="text-base text-[hsl(160,70%,15%)]/60 leading-relaxed mb-4">
              <strong>Lake City Development (Pvt) Ltd</strong> is a Zimbabwean land development company that sells 
              residential stands on a <strong>36-month instalment basis</strong>. Customers purchase land and make 
              fixed monthly payments (typically <strong>$50 – $500 USD</strong>) until the stand is fully paid off, 
              at which point the Agreement of Sale is finalised.
            </p>
            <p className="text-base text-[hsl(160,70%,15%)]/60 leading-relaxed mb-6">
              The company currently manages <strong>70 active customer accounts</strong> across multiple 
              development phases, with all financial records maintained via a centralised payment ledger. 
              StandLedger is the proprietary customer portal that gives buyers real-time visibility into 
              their balances, statements, and documents.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800 leading-relaxed">
                <strong>🏦 Banking Requirement:</strong> All payments, regardless of country of origin, 
                must settle into Lake City's <strong>CABS (Central Africa Building Society) account in Zimbabwe (USD)</strong>. 
                CABS is our primary banking partner for all collections.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-6">
              <h3 className="text-base font-bold text-[hsl(160,70%,15%)] mb-4 flex items-center gap-2">
                <Users className="w-4 h-4" /> Customer Profile
              </h3>
              <ul className="space-y-2.5 text-base text-[hsl(160,70%,15%)]/60">
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Individual land buyers (not corporate)</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Monthly instalment payments of $50 – $500</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />36-month payment plans (average)</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Mobile-first users, primarily smartphone access</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Mix of local and diaspora customers</li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-6">
              <h3 className="text-base font-bold text-[hsl(160,70%,15%)] mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4" /> Where Our Customers Are
              </h3>
              <div className="space-y-2">
                {[
                  { flag: "🇬🇧", country: "United Kingdom", pct: 41 },
                  { flag: "🇿🇼", country: "Zimbabwe", pct: 19 },
                  { flag: "🇺🇸", country: "United States", pct: 16 },
                  { flag: "🇦🇺", country: "Australia", pct: 9 },
                  { flag: "🇿🇦", country: "South Africa", pct: 4 },
                  { flag: "🇦🇪", country: "UAE", pct: 3 },
                  { flag: "🇿🇲", country: "Zambia", pct: 3 },
                  { flag: "🇳🇿", country: "New Zealand", pct: 1 },
                  { flag: "🇪🇹", country: "Ethiopia", pct: 1 },
                  { flag: "🇸🇦", country: "Saudi Arabia", pct: 1 },
                ].map((loc) => (
                  <div key={loc.country} className="flex items-center justify-between py-1.5 border-b border-[hsl(160,10%,90%)] last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base shrink-0">{loc.flag}</span>
                      <span className="text-sm font-medium text-[hsl(160,70%,15%)]">{loc.country}</span>
                    </div>
                    <span className="text-sm font-semibold text-[hsl(160,70%,15%)]">{loc.pct}%</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 bg-[hsl(160,70%,15%)]/5 rounded-lg p-3">
                <p className="text-xs text-[hsl(160,70%,15%)]/70 leading-relaxed">
                  <strong>Key implication:</strong> The payment gateway must support cross-border payments from GBP, USD, AUD, ZAR, AED, NZD, and ZMW origins, 
                  all terminating in USD at <strong>CABS, Zimbabwe</strong>.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-6">
              <h3 className="text-base font-bold text-[hsl(160,70%,15%)] mb-4 flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Monthly Payment Distribution
              </h3>
              <div className="space-y-2">
                {[
                  { band: "$0 – $499", pct: 16, bar: "w-[16%]" },
                  { band: "$500 – $999", pct: 4, bar: "w-[4%]" },
                  { band: "$1,000 – $1,499", pct: 51, bar: "w-[51%]" },
                  { band: "$1,500 – $1,999", pct: 19, bar: "w-[19%]" },
                  { band: "$2,000+", pct: 10, bar: "w-[10%]" },
                ].map((b) => (
                  <div key={b.band} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[hsl(160,70%,15%)]">{b.band}</span>
                      <span className="text-sm font-semibold text-[hsl(160,70%,15%)]">{b.pct}%</span>
                    </div>
                    <div className="h-2 bg-[hsl(160,70%,15%)]/10 rounded-full overflow-hidden">
                      <div className={`h-full bg-gradient-to-r from-[hsl(160,60%,35%)] to-[hsl(160,70%,45%)] rounded-full ${b.bar}`} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 bg-[hsl(160,70%,15%)]/5 rounded-lg p-3">
                <p className="text-xs text-[hsl(160,70%,15%)]/70 leading-relaxed">
                  <strong>Key insight:</strong> Over half of all customers pay between <strong>$1,000 – $1,499/mo</strong>, 
                  well within the <strong>$999 per-transaction cap</strong> when split across two payments.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Platform Overview ── */}
        <SectionDivider label="Platform Overview" />
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold text-[hsl(160,70%,15%)] mb-4">What is StandLedger?</h2>
            <p className="text-base text-[hsl(160,70%,15%)]/60 leading-relaxed mb-6">
              StandLedger is a proprietary customer portal built for <strong>Lake City Development (Pvt) Ltd</strong>, 
              a Zimbabwean land development company. The platform gives customers real-time visibility into their 
              land purchase agreements, payment schedules, balances, and account documents.
            </p>
            <p className="text-base text-[hsl(160,70%,15%)]/60 leading-relaxed mb-6">
              Built on a modern React/TypeScript stack with a serverless backend, StandLedger is designed 
              as a progressive web app (PWA) optimised for mobile-first usage in the Zimbabwean market.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={Users} value="70" label="Active Customers" />
              <StatCard icon={DollarSign} value="$999" label="Max Transaction" />
              <StatCard icon={BarChart3} value="~4%" label="Est. Processing Fee" />
              <StatCard icon={Layers} value="36 mo" label="Avg. Payment Plan" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-6">
              <h3 className="text-base font-bold text-[hsl(160,70%,15%)] mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4" /> Tech Stack
              </h3>
              <div className="space-y-2">
                {[
                  ["Frontend", "React 18 + TypeScript + Tailwind CSS + Vite"],
                  ["Backend", "Serverless Edge Functions (Deno runtime)"],
                  ["Database", "PostgreSQL with Row-Level Security"],
                  ["Auth", "Email/password + SMS OTP + 2FA"],
                  ["Hosting", "Lovable Cloud (auto-scaling)"],
                  ["Data Sync", "Google Sheets API for payment ledger"],
                  ["Mobile", "Progressive Web App (PWA)"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start gap-3 text-base">
                    <span className="font-semibold text-[hsl(160,70%,15%)] w-24 shrink-0">{k}</span>
                    <span className="text-[hsl(160,70%,15%)]/60">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-6">
              <h3 className="text-base font-bold text-[hsl(160,70%,15%)] mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4" /> Security Model
              </h3>
              <ul className="space-y-2.5 text-base text-[hsl(160,70%,15%)]/60">
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Row-Level Security on all tables</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />SMS-based 2FA for customer login</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Session timeout & token management</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Full audit log of admin actions</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Leaked password protection</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── Integration Points ── */}
        <SectionDivider label="Integration Points" />
        <div className="mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-[hsl(160,70%,15%)] mb-4">Where Payments Fit In</h2>
          <p className="text-base text-[hsl(160,70%,15%)]/60 leading-relaxed max-w-3xl mb-8">
            The customer journey naturally creates multiple moments where a <strong>"Pay Now"</strong> call-to-action 
            delivers maximum value. Below are the key screens where a payment button would be surfaced.
          </p>
          
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Dashboard — Payment Summary",
                desc: "The primary landing screen shows current balance, next due date, and amount due. A prominent 'Make Payment' button here catches customers at their most engaged moment.",
                cta: "Make Payment →",
              },
              {
                title: "Monthly Statement View",
                desc: "After reviewing their statement breakdown—opening balance, payments received, closing balance—customers can immediately act on what they owe.",
                cta: "Pay This Balance →",
              },
              {
                title: "Payment History Tab",
                desc: "The full payment ledger shows all 36 months. A persistent floating button lets customers pay at any time while reviewing their history.",
                cta: "Add Payment →",
              },
            ].map((item, i) => (
              <Card key={i} className="border-[hsl(160,10%,90%)] overflow-hidden">
                <div className="h-2 bg-gradient-to-r from-[hsl(160,70%,15%)] to-emerald-400" />
                <CardContent className="p-6">
                  <h3 className="font-bold text-[hsl(160,70%,15%)] mb-2">{item.title}</h3>
                  <p className="text-base text-[hsl(160,70%,15%)]/50 leading-relaxed mb-4">{item.desc}</p>
                  <div className="bg-[hsl(160,70%,15%)] text-white text-xs font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1">
                    {item.cta}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ── Checkout Experience Mockup ── */}
        <SectionDivider label="Checkout Experience" />
        <div className="grid md:grid-cols-2 gap-12 items-center mb-8">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold text-[hsl(160,70%,15%)] mb-4">
              Frictionless Checkout
            </h2>
            <p className="text-base text-[hsl(160,70%,15%)]/60 leading-relaxed mb-6">
              Our goal is <strong>"Ease of Payment"</strong>. The checkout experience is designed to feel seamless and familiar — just 3 steps to complete a payment. Customers only need:
            </p>
            <div className="space-y-4 mb-8">
              {[
                { num: "1", title: "Name", desc: "Pre-filled from their authenticated session" },
                { num: "2", title: "Stand Number", desc: "Auto-populated from their profile" },
                { num: "3", title: "Payment Amount", desc: "Customer enters their desired payment (max $999)" },
              ].map((item) => (
                <div key={item.num} className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-[hsl(160,70%,15%)] text-white text-sm font-bold flex items-center justify-center shrink-0">
                    {item.num}
                  </div>
                  <div>
                    <div className="font-semibold text-[hsl(160,70%,15%)] text-base">{item.title}</div>
                    <div className="text-sm text-[hsl(160,70%,15%)]/60">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800 leading-relaxed">
                <strong>Processing Fee:</strong> An estimated ~4% fee will apply per transaction. 
                This is transparently displayed to the customer on the confirmation screen before they authorise payment.
              </p>
            </div>
          </div>
          <CheckoutMockup />
        </div>

        {/* ── Phased Approach ── */}
        <SectionDivider label="Phased Approach" />
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-[hsl(160,70%,15%)] mb-3">Implementation Roadmap</h2>
          <p className="text-base text-[hsl(160,70%,15%)]/50 max-w-2xl mx-auto">
            A pragmatic, phased rollout that delivers value early while building toward a fully integrated payment ecosystem.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <PhaseCard
            phase="P1"
            title="Guided Bank Payment"
            subtitle="Quick Win — 2-4 weeks"
            color="hsl(160,70%,15%)"
            active
            items={[
              "Customer clicks 'Make Payment' on StandLedger",
              "Shown their unique payment reference (Stand #) and bank details",
              "Customer visits their bank (in-branch or online banking) to initiate transfer",
              "Payment reconciled manually via existing receipting process",
              "Confirmation notification sent to customer once payment is recorded",
              "No API integration required — purely informational flow",
            ]}
          />
          <PhaseCard
            phase="P2"
            title="Embedded Checkout"
            subtitle="Core Integration — 6-8 weeks"
            color="hsl(160,50%,30%)"
            items={[
              "Full checkout flow embedded within StandLedger (as shown in mockup)",
              "Payment gateway API integration via secure Edge Functions",
              "Real-time payment confirmation and receipt generation",
              "Automatic ledger update — no manual reconciliation",
              "Support for local card payments (Visa/Mastercard)",
              "Webhook-based payment status tracking",
              "Transaction history visible to both customer and admin",
            ]}
          />
          <PhaseCard
            phase="P3"
            title="Multi-Method Hub"
            subtitle="Full Ecosystem — 10-12 weeks"
            color="hsl(38,70%,55%)"
            items={[
              "Unified payment selector: Credit Card, Bank Transfer, Wire, ACH, Mobile Money",
              "Customer receives a payment link via SMS/Email/WhatsApp",
              "Click-to-pay from any channel — all processed through StandLedger",
              "Split payment support (pay partial amounts across methods)",
              "Recurring/scheduled payment setup for monthly instalments",
              "Diaspora-friendly: International wire & ACH for overseas customers",
              "Full reporting dashboard for Lake City finance team",
            ]}
          />
        </div>

        {/* ── API Integration Architecture ── */}
        <SectionDivider label="Technical Architecture" />

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-8">
            <h3 className="text-2xl md:text-3xl font-bold text-[hsl(160,70%,15%)] mb-4">Integration Flow (Phase 2+)</h3>
            <div className="space-y-4">
              {[
                { step: "1", title: "Customer initiates payment", desc: "Name, Stand Number, Amount submitted via React frontend" },
                { step: "2", title: "Edge Function creates payment intent", desc: "Serverless function calls Partner API to initiate transaction" },
                { step: "3", title: "Customer completes payment", desc: "Redirected to Partner's secure payment page or embedded form" },
                { step: "4", title: "Webhook confirms settlement", desc: "Partner sends callback → Edge Function processes & updates ledger" },
                { step: "5", title: "Receipt & notification", desc: "Customer receives confirmation; admin dashboard updated in real-time" },
              ].map((item) => (
                <div key={item.step} className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-[hsl(160,70%,15%)]/10 text-[hsl(160,70%,15%)] text-sm font-bold flex items-center justify-center shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <div className="text-base font-semibold text-[hsl(160,70%,15%)]">{item.title}</div>
                    <div className="text-sm text-[hsl(160,70%,15%)]/60">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-8">
            <h3 className="text-2xl md:text-3xl font-bold text-[hsl(160,70%,15%)] mb-4">What We Need From Partner</h3>
            <div className="space-y-3">
              {[
                "REST API documentation (OpenAPI/Swagger preferred)",
                "Sandbox/test environment credentials",
                "Webhook specification for payment status callbacks",
                "Supported payment methods & currencies (USD, ZWL)",
                "Transaction limit confirmation ($999 cap)",
                "Fee schedule breakdown (per-transaction, monthly, setup)",
                "Settlement timeline (T+1, T+3, etc.)",
                "PCI DSS compliance documentation",
                "Integration support contact / Slack channel",
                "Sample API requests & responses",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 text-base text-[hsl(160,70%,15%)]/70">
                  <ArrowUpRight className="w-4 h-4 text-[hsl(38,70%,55%)] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="bg-gradient-to-br from-[hsl(160,70%,8%)] via-[hsl(160,50%,12%)] to-[hsl(160,30%,20%)] rounded-3xl p-12 text-center">
          <img src={logoWordmark} alt="StandLedger" className="h-8 brightness-0 invert mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">Ready to Build Together?</h2>
          <p className="text-white/50 text-base max-w-md mx-auto mb-8">
            We're excited to partner on making land payments effortless for our customers.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-white/40 text-sm">
            <span>Lake City Development (Pvt) Ltd</span>
            <span>•</span>
            <span>Harare, Zimbabwe</span>
            <span>•</span>
            <span>Confidential — February 2026</span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PaymentGatewayProposal;
