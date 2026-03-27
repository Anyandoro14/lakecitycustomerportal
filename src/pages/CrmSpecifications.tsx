import { useState } from "react";
import {
  Lock, Shield, Eye, EyeOff, ArrowLeft, Check, AlertTriangle,
  Database, Users, MessageSquare, BarChart3, Globe, Zap, Server,
  FileText, Clock, Layers, ArrowRight, Phone, Mail, Search,
  Settings, Bell, Link2, GitBranch, HelpCircle, Send, Building2, 
  Headphones, BookOpen, ChevronDown, ChevronUp, Target, Workflow,
  UserCheck, TrendingUp, ShieldCheck, Key, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import logoWordmark from "@/assets/logo-wordmark-sea-green.svg";
import { useToast } from "@/hooks/use-toast";

/* ─────────────────── Password Gate ─────────────────── */
const PasswordGate = ({ onUnlock }: { onUnlock: () => void }) => {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("verify-crm-spec-access", {
        body: { password: pw },
      });
      if (fnError || !data?.valid) setError(true);
      else onUnlock();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(160,70%,8%)] via-[hsl(160,50%,12%)] to-[hsl(160,30%,18%)] flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <img src={logoWordmark} alt="StandLedger" className="h-10 mx-auto mb-6 brightness-0 invert" />
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-white/70 text-xs font-medium tracking-wider uppercase mb-4">
            <Lock className="w-3 h-3" /> Confidential Document
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">CRM Implementation Specifications</h1>
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
            <Button type="submit" disabled={loading} className="w-full h-12 bg-white text-[hsl(160,70%,15%)] hover:bg-white/90 font-semibold text-sm">
              <Shield className="w-4 h-4 mr-2" /> {loading ? "Verifying…" : "Unlock Document"}
            </Button>
          </div>
        </form>
        <p className="text-white/30 text-xs text-center mt-6">Shared between Lake City Development & CRM Implementation Partner only.</p>
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

/* ─────────────── Expandable Spec Section ─────────────── */
const ExpandableSection = ({ number, title, icon: Icon, items, defaultOpen = false }: {
  number: string; title: string; icon: any; items: { label: string; detail: string }[]; defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 p-5 bg-white rounded-2xl border border-[hsl(160,10%,90%)] hover:border-[hsl(160,70%,15%)]/30 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[hsl(160,70%,15%)]/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-[hsl(160,70%,15%)]" />
          </div>
          <div className="text-left">
            <span className="text-xs font-mono text-[hsl(160,70%,15%)]/40 block">{number}</span>
            <h2 className="text-lg font-bold text-[hsl(160,70%,15%)]">{title}</h2>
          </div>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-[hsl(160,70%,15%)]/40" /> : <ChevronDown className="w-5 h-5 text-[hsl(160,70%,15%)]/40" />}
      </button>
      {open && (
        <div className="mt-2 bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-6 space-y-4">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-xs font-mono text-[hsl(160,70%,15%)]/30 mt-1 shrink-0 w-10">{number}.{i + 1}</span>
              <div>
                <div className="text-sm font-semibold text-[hsl(160,70%,15%)]">{item.label}</div>
                <div className="text-sm text-[hsl(160,70%,15%)]/60 leading-relaxed">{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

/* ─────────────── Phase Card ─────────────── */
const PhaseCard = ({ phase, title, subtitle, items, color, active }: {
  phase: string; title: string; subtitle: string; items: string[]; color: string; active?: boolean;
}) => (
  <div className={`relative rounded-3xl border-2 p-8 transition-all ${active ? "border-[hsl(160,70%,15%)] shadow-xl shadow-[hsl(160,70%,15%)]/10" : "border-[hsl(160,10%,90%)]"}`}>
    {active && (
      <div className="absolute -top-3 left-8 bg-[hsl(160,70%,15%)] text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
        Current Phase
      </div>
    )}
    <div className="flex items-start gap-4 mb-6">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ background: color }}>
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

/* ─────────────── Question Form ─────────────── */
const QuestionForm = () => {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", company: "", email: "", category: "General", question: "" });
  const [sending, setSending] = useState(false);

  const categories = [
    "General", "Data Model", "Integration / API", "Security & Compliance",
    "Migration", "Licensing / Pricing", "Scalability", "Timeline", "Other"
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.question) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-crm-spec-question", { body: form });
      if (error || !data?.success) throw new Error("Failed");
      toast({ title: "Question submitted", description: "Our team will respond within 2 business days." });
      setForm({ name: "", company: "", email: "", category: "General", question: "" });
    } catch {
      toast({ title: "Failed to submit", description: "Please try again or email directly.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[hsl(160,70%,15%)]/10 flex items-center justify-center">
          <HelpCircle className="w-5 h-5 text-[hsl(160,70%,15%)]" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-[hsl(160,70%,15%)]">Ask a Question</h3>
          <p className="text-xs text-[hsl(160,70%,15%)]/50">Responses sent to alex@lakecity.co.zw & tanaka@lakecity.co.zw</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs font-medium text-[hsl(160,70%,15%)]/60 mb-1 block">Full Name *</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" className="h-11" maxLength={200} />
        </div>
        <div>
          <label className="text-xs font-medium text-[hsl(160,70%,15%)]/60 mb-1 block">Company</label>
          <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company name" className="h-11" maxLength={200} />
        </div>
        <div>
          <label className="text-xs font-medium text-[hsl(160,70%,15%)]/60 mb-1 block">Email *</label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" className="h-11" maxLength={255} />
        </div>
        <div>
          <label className="text-xs font-medium text-[hsl(160,70%,15%)]/60 mb-1 block">Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm"
          >
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="mb-4">
        <label className="text-xs font-medium text-[hsl(160,70%,15%)]/60 mb-1 block">Your Question *</label>
        <Textarea
          value={form.question}
          onChange={(e) => setForm({ ...form, question: e.target.value })}
          placeholder="Describe your question in detail..."
          className="min-h-[120px]"
          maxLength={5000}
        />
      </div>
      <Button type="submit" disabled={sending} className="bg-[hsl(160,70%,15%)] hover:bg-[hsl(160,70%,20%)] text-white">
        <Send className="w-4 h-4 mr-2" /> {sending ? "Sending…" : "Submit Question"}
      </Button>
    </form>
  );
};

/* ─────────────── Main Page ─────────────── */
const CrmSpecifications = () => {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="min-h-screen bg-[hsl(0,0%,98%)]">
      {/* Hero */}
      <header className="relative bg-gradient-to-br from-[hsl(160,70%,8%)] via-[hsl(160,50%,12%)] to-[hsl(160,30%,20%)] overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, hsl(160,70%,40%) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(200,70%,55%) 0%, transparent 40%)" }} />
        <div className="max-w-6xl mx-auto px-6 py-20 relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <img src={logoWordmark} alt="StandLedger" className="h-8 brightness-0 invert" />
            <span className="text-white/30 text-xl">×</span>
            <span className="text-white/60 text-base font-medium tracking-wide">CRM Implementation Partner</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-white leading-tight max-w-4xl">
            CRM Integration<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-cyan-200">Specifications & RFI Brief</span>
          </h1>
          <p className="text-white/50 text-xl mt-6 max-w-3xl leading-relaxed">
            Complete technical specifications for implementing a CRM solution that integrates with the StandLedger 
            customer portal — supporting 10,000+ customers across multiple geographies and customer types.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            {["Confidential", "March 2026", "v1.0", "RFI Document"].map((tag) => (
              <span key={tag} className="bg-white/10 border border-white/10 text-white/70 text-sm font-medium px-4 py-1.5 rounded-full">{tag}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-10">
            <a href="#specifications">
              <Button className="bg-white text-[hsl(160,70%,15%)] hover:bg-white/90 font-semibold h-12 px-6">
                <FileText className="w-4 h-4 mr-2" /> View Specifications
              </Button>
            </a>
            <a href="#questions">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 h-12 px-6">
                <HelpCircle className="w-4 h-4 mr-2" /> Ask a Question
              </Button>
            </a>
            <a href="/crm-specs/technical">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 h-12 px-6">
                <Database className="w-4 h-4 mr-2" /> Technical Deep-Dive
              </Button>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        {/* ── About Lake City & The Problem ── */}
        <SectionDivider label="Business Context" />
        <div className="grid md:grid-cols-2 gap-12 items-start mb-16">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold text-[hsl(160,70%,15%)] mb-4">Why We Need a CRM</h2>
            <p className="text-base text-[hsl(160,70%,15%)]/60 leading-relaxed mb-4">
              <strong>Warwickshire Pvt Ltd (Lake City Development)</strong> is a Zimbabwean land development company 
              selling residential stands on a <strong>36-month instalment basis</strong>. As we scale from ~70 customers 
              to <strong>10,000+</strong>, our current operational tooling (Google Sheets, manual processes) will not sustain 
              the volume, consistency, or compliance requirements of a growing portfolio.
            </p>
            <p className="text-base text-[hsl(160,70%,15%)]/60 leading-relaxed mb-4">
              We require a CRM that serves as the <strong>single source of truth</strong> for all customer interactions, 
              payment tracking, collections workflows, support cases, and lifecycle management — fully integrated with 
              our existing <strong>StandLedger</strong> customer portal.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-amber-800 leading-relaxed">
                <strong>⚠️ Critical Requirement:</strong> The CRM must serve <strong>all customer types</strong> — 
                active payers, fully paid customers, defaulters, customers with payment extensions, and pre-sale leads. 
                It must handle at minimum <strong>10,000 customer records</strong> with room to scale.
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800 leading-relaxed">
                <strong>🔒 Data Sensitivity:</strong> No customer PII (names, phone numbers, emails, balances, stand numbers) 
                should be shared with or visible to third-party vendors without explicit written authorisation. All data handling 
                must comply with applicable privacy regulations.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={Users} value="10,000+" label="Target Capacity" />
              <StatCard icon={Globe} value="10+" label="Countries Served" />
              <StatCard icon={MessageSquare} value="3" label="Channels (SMS, Email, WhatsApp)" />
              <StatCard icon={Layers} value="6" label="Customer Types" />
            </div>
            <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-6">
              <h3 className="text-base font-bold text-[hsl(160,70%,15%)] mb-4 flex items-center gap-2">
                <Target className="w-4 h-4" /> Customer Types to Support
              </h3>
              <ul className="space-y-2.5 text-sm text-[hsl(160,70%,15%)]/60">
                {[
                  "Active Payers — Currently on payment plan (36-month instalment)",
                  "Fully Paid — Completed all instalments, awaiting or received title deed",
                  "Defaulters — Missed 2+ consecutive payments, collections workflow required",
                  "Extension Holders — Granted temporary payment holiday or revised schedule",
                  "Pre-Sale Leads — Prospects in the sales pipeline, not yet signed",
                  "Inactive / Cancelled — Contracts terminated or voluntarily withdrawn",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── Current Tech Stack ── */}
        <SectionDivider label="Existing Platform" />
        <div className="grid md:grid-cols-2 gap-12 items-start mb-16">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold text-[hsl(160,70%,15%)] mb-4">StandLedger Platform</h2>
            <p className="text-base text-[hsl(160,70%,15%)]/60 leading-relaxed mb-6">
              StandLedger is our proprietary customer portal. The CRM <strong>must integrate</strong> with this 
              platform, not replace it. StandLedger handles the customer-facing experience; the CRM handles 
              the internal operations and data management layer.
            </p>
            <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-6">
              <h3 className="text-base font-bold text-[hsl(160,70%,15%)] mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4" /> Tech Stack
              </h3>
              <div className="space-y-2">
                {[
                  ["Frontend", "React 18 + TypeScript + Tailwind CSS + Vite"],
                  ["Backend", "Serverless Edge Functions (Deno runtime)"],
                  ["Database", "PostgreSQL with Row-Level Security (RLS)"],
                  ["Auth", "Email/password + SMS OTP (Twilio) + 2FA"],
                  ["Hosting", "Lovable Cloud (auto-scaling)"],
                  ["Data Sync", "Google Sheets API (Collection Schedule ledger)"],
                  ["Messaging", "Twilio (SMS/WhatsApp) + Resend (Email)"],
                  ["Mobile", "Progressive Web App (PWA)"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start gap-3 text-sm">
                    <span className="font-semibold text-[hsl(160,70%,15%)] w-24 shrink-0">{k}</span>
                    <span className="text-[hsl(160,70%,15%)]/60">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-6">
              <h3 className="text-base font-bold text-[hsl(160,70%,15%)] mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4" /> Security Model
              </h3>
              <ul className="space-y-2.5 text-sm text-[hsl(160,70%,15%)]/60">
                {[
                  "Row-Level Security (RLS) on all database tables",
                  "SMS-based 2FA for customer login (Twilio Verify)",
                  "Role-based access: Super Admin, Director, Admin, Helpdesk",
                  "Session timeout with automatic logout",
                  "Leaked password protection (HIBP check)",
                  "Complete audit log of all administrative actions",
                  "IP logging for security-sensitive operations",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-6">
              <h3 className="text-base font-bold text-[hsl(160,70%,15%)] mb-4 flex items-center gap-2">
                <Workflow className="w-4 h-4" /> Existing Internal Features
              </h3>
              <ul className="space-y-2.5 text-sm text-[hsl(160,70%,15%)]/60">
                {[
                  "Internal portal with staff role management",
                  "CRM messaging inbox (WhatsApp/SMS/Email)",
                  "Collections command centre with AI outreach",
                  "Customer lookup (stand, phone, email)",
                  "Support case management system",
                  "Article/update publishing & broadcasting",
                  "Training centre for staff onboarding",
                  "Looking Glass — view portal as customer",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── What We Need ── */}
        <SectionDivider label="CRM Requirements" />
        <div className="mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-[hsl(160,70%,15%)] mb-4">Core CRM Capabilities Required</h2>
          <p className="text-base text-[hsl(160,70%,15%)]/60 leading-relaxed max-w-3xl mb-8">
            The CRM must extend — not duplicate — our existing infrastructure. Below are the detailed functional 
            and non-functional requirements organised by domain.
          </p>
        </div>

        <div id="specifications" className="space-y-4">
          <ExpandableSection
            number="1"
            title="Contact & Account Management"
            icon={Users}
            defaultOpen
            items={[
              { label: "Unified Customer Profile", detail: "Single 360° view of each customer including contact info, stand details, payment history, communication log, support cases, and documents. Stand Number is the primary identifier." },
              { label: "Multi-Contact Linking", detail: "A single stand may have multiple contacts (spouse, power of attorney, family member). The CRM must support M:N relationships between contacts and accounts (stands)." },
              { label: "Customer Categorisation", detail: "Automatically classify customers as Active, Fully Paid, Defaulter, Extension, Lead, or Inactive based on payment behaviour and contract status." },
              { label: "Duplicate Detection", detail: "Intelligent dedup across phone number, email, and national ID. Surface duplicates for merge review rather than auto-merging." },
              { label: "Lifecycle Tracking", detail: "Track each customer through: Lead → Signed → Active → Fully Paid or Defaulter → Archived. Automated status transitions based on business rules." },
              { label: "Custom Fields", detail: "Support for at least 50 custom fields per entity type. Fields must support text, number, date, dropdown, multi-select, and file attachment types." },
              { label: "Bulk Import / Export", detail: "CSV/Excel import with field mapping wizard. Bulk export with column selection. API-based import for scheduled syncs." },
              { label: "Geographic Segmentation", detail: "Tag customers by country of residence (10+ countries) for targeted outreach and compliance. Support timezone-aware communication scheduling." },
            ]}
          />

          <ExpandableSection
            number="2"
            title="Communication Hub"
            icon={MessageSquare}
            items={[
              { label: "Omnichannel Inbox", detail: "Unified inbox for WhatsApp, SMS, and Email. All channels must converge into a single conversation thread per customer. Our existing Twilio (SMS/WhatsApp) and Resend (Email) accounts must be supported." },
              { label: "Template Management", detail: "Pre-approved message templates for collections, reminders, updates, and onboarding. Templates must support dynamic variables (customer name, stand number, balance, due date)." },
              { label: "Two-Way Messaging", detail: "Staff must be able to send and receive messages from within the CRM. Inbound messages must auto-route to the assigned agent or team queue." },
              { label: "Communication Scheduling", detail: "Schedule messages for future delivery. Respect customer timezone and business hours. Bulk scheduling for campaign-style outreach." },
              { label: "Auto-Responders", detail: "Configurable auto-reply for after-hours, holidays, and acknowledgement of received messages. Must not interfere with human agent takeover." },
              { label: "Delivery Tracking", detail: "Real-time delivery status for each message: queued → sent → delivered → read → failed. Failed messages must trigger an alert." },
              { label: "Internal Notes", detail: "Private notes attached to conversations visible only to internal staff. Notes must be timestamped and attributed to the author." },
              { label: "Communication History", detail: "Full, searchable history of all customer communications across all channels. Minimum 3-year retention with no data loss." },
            ]}
          />

          <ExpandableSection
            number="3"
            title="Collections & Payment Workflow"
            icon={TrendingUp}
            items={[
              { label: "Collections Pipeline", detail: "Visual pipeline for tracking defaulters through stages: Gentle Reminder → Formal Notice → Legal Warning → Escalation → Resolution. Auto-progression based on elapsed time and customer response." },
              { label: "Payment Tracking Integration", detail: "The CRM must read payment data from our master ledger (currently Google Sheets, migrating to PostgreSQL). It must never be the source of truth for payments — only a consumer." },
              { label: "Overdue Detection", detail: "Automated flagging of customers who miss payments. Configurable thresholds: 1 missed = gentle, 2 = formal, 3+ = escalation. Must account for payment extensions." },
              { label: "AI-Assisted Outreach", detail: "Generate context-aware collection messages using customer history. Support Gentle, Professional, and Formal tone presets. Human approval required before sending." },
              { label: "Promise-to-Pay Tracking", detail: "Record and track customer commitments to pay by a specific date. Auto-escalate if promise is broken. Dashboard showing all outstanding promises." },
              { label: "Extension Management", detail: "Workflow for granting payment extensions. Requires approver sign-off. Automatically adjusts overdue calculations during extension period." },
              { label: "Collections Reporting", detail: "Dashboard showing: total overdue amount, number of defaulters, recovery rate, average days to resolution, agent performance metrics." },
            ]}
          />

          <ExpandableSection
            number="4"
            title="Support Case Management"
            icon={Headphones}
            items={[
              { label: "Ticket System", detail: "Create, assign, track, and resolve support cases. Auto-generate case numbers (format: LC-XXXXXX). Support priority levels: Low, Medium, High, Urgent." },
              { label: "SLA Management", detail: "Configurable SLA timers per priority level. Visual indicators for approaching and breached SLAs. Escalation rules when SLA is at risk." },
              { label: "Case Categorisation", detail: "Hierarchical issue taxonomy: Payment Issues (receipt missing, incorrect amount, refund), Account Issues (login, 2FA, profile update), Document Requests (statement, agreement of sale), General Enquiries." },
              { label: "Case-to-Conversation Linking", detail: "Ability to link support cases to CRM conversations and vice versa. Full audit trail showing when links were created and by whom." },
              { label: "Knowledge Base Integration", detail: "Internal knowledge base for common resolutions. Suggested articles when creating or responding to cases. Track which articles resolve which case types." },
              { label: "Customer Satisfaction", detail: "Post-resolution CSAT survey via preferred communication channel. Track satisfaction scores per agent, category, and time period." },
            ]}
          />

          <ExpandableSection
            number="5"
            title="Automation & Workflows"
            icon={RefreshCw}
            items={[
              { label: "Workflow Builder", detail: "Visual drag-and-drop workflow builder for automating repetitive tasks. Support triggers: time-based, event-based (new payment, missed payment, status change), and manual." },
              { label: "Automated Reminders", detail: "Payment due reminders at configurable intervals (7 days before, 3 days before, due date, 1 day after, 7 days after). Channel preference per customer." },
              { label: "Onboarding Automation", detail: "Automated welcome sequence for new customers: welcome message → portal registration invite → first payment reminder → 30-day check-in." },
              { label: "Assignment Rules", detail: "Auto-assign customers to staff based on rules: geographic region, customer category, language preference, workload balancing." },
              { label: "Escalation Rules", detail: "Automatic escalation when: payment is 60+ days overdue, support case breaches SLA, customer sends urgent keyword, VIP customer flags." },
              { label: "Batch Operations", detail: "Bulk status update, bulk message send, bulk reassignment. All batch operations must be audit-logged and support undo within 24 hours." },
            ]}
          />

          <ExpandableSection
            number="6"
            title="Reporting & Analytics"
            icon={BarChart3}
            items={[
              { label: "Executive Dashboard", detail: "High-level KPIs: total customers, active payers, defaulter rate, total outstanding, monthly collection rate, customer growth trend, channel effectiveness." },
              { label: "Custom Report Builder", detail: "Drag-and-drop report builder with filters, grouping, and aggregations. Support for scheduled report delivery via email (PDF/CSV)." },
              { label: "Agent Performance", detail: "Track per-agent metrics: cases resolved, response time, CSAT score, messages sent, collections recovered. Leaderboard view." },
              { label: "Communication Analytics", detail: "Message volume by channel, delivery rates, response rates, peak communication times, template performance (open/click rates for email)." },
              { label: "Collections Analytics", detail: "Recovery rate by stage, average days to resolution, promise-to-pay conversion rate, escalation frequency, regional collection patterns." },
              { label: "Data Export API", detail: "Programmatic access to all report data via REST API. Support for scheduled data exports to external BI tools. Webhook notifications for report completion." },
            ]}
          />

          <ExpandableSection
            number="7"
            title="Integration Requirements"
            icon={Link2}
            items={[
              { label: "REST API", detail: "Full CRUD REST API with OpenAPI 3.0 documentation. API versioning. Rate limiting. OAuth 2.0 or API key authentication. Webhook support for real-time events." },
              { label: "Google Sheets Sync", detail: "Two-way sync with our Collection Schedule spreadsheet. Read payment data, customer details, stand information. Write back CRM-generated data (notes, status updates) if required." },
              { label: "PostgreSQL Direct Access", detail: "Option to connect directly to our PostgreSQL database for real-time data access. Must respect Row-Level Security policies. Read-only access preferred for data integrity." },
              { label: "Twilio Integration", detail: "Native integration with Twilio for SMS and WhatsApp messaging. Must use our existing Twilio account and phone numbers. Support Twilio Verify for 2FA flows." },
              { label: "Resend Integration", detail: "Email sending via our Resend account (verified domain: lakecity.co.zw). Must support transactional and marketing email categories." },
              { label: "Webhook Endpoints", detail: "Expose webhook endpoints for: new customer created, payment received, status changed, message received, case created, case resolved. Payload must include full entity data." },
              { label: "SSO / Authentication", detail: "Support Single Sign-On with our existing auth system. Staff should not maintain separate CRM credentials. Support our role hierarchy: Super Admin, Director, Admin, Helpdesk." },
              { label: "Import Existing Data", detail: "Migration toolkit for importing: profiles table (~70 records growing to 10,000+), conversations, messages, support cases, collections notes, audit logs. Zero data loss requirement." },
            ]}
          />

          <ExpandableSection
            number="8"
            title="Security & Compliance"
            icon={ShieldCheck}
            items={[
              { label: "Data Encryption", detail: "AES-256 encryption at rest. TLS 1.2+ in transit. Field-level encryption for PII (phone numbers, email addresses, national IDs)." },
              { label: "Access Control", detail: "Role-based access control (RBAC) matching our hierarchy. Field-level permissions (e.g., Helpdesk cannot view payment amounts). IP whitelisting for API access." },
              { label: "Audit Trail", detail: "Immutable audit log of all data changes, access events, and administrative actions. Log retention: minimum 7 years. Include IP address, user agent, and timestamp." },
              { label: "Data Residency", detail: "Data must be stored in a SOC 2 Type II compliant facility. Preference for European or African data centre. No data stored in jurisdictions with weak privacy laws." },
              { label: "GDPR Compliance", detail: "Support for data subject access requests (DSAR). Right to erasure (with legal retention exceptions). Data portability in machine-readable format. Consent management." },
              { label: "Penetration Testing", detail: "Annual third-party penetration test results must be shared. Vulnerability disclosure process must be documented. Critical vulnerabilities must be patched within 72 hours." },
              { label: "Backup & Recovery", detail: "Automated daily backups with point-in-time recovery. RPO: 1 hour. RTO: 4 hours. Backup tested quarterly. Off-site backup in a separate geographic region." },
              { label: "Two-Factor Authentication", detail: "Mandatory 2FA for all CRM users (staff). Support TOTP (Google Authenticator, Authy) and SMS as fallback." },
            ]}
          />

          <ExpandableSection
            number="9"
            title="Scalability & Performance"
            icon={Server}
            items={[
              { label: "Capacity", detail: "Must support at minimum 10,000 customer records with linear performance scaling to 100,000+. No degradation below 50,000 records." },
              { label: "Concurrent Users", detail: "Support minimum 50 concurrent internal users without performance degradation. Peak usage: 9am–5pm CAT (UTC+2)." },
              { label: "API Throughput", detail: "Minimum 500 API requests per minute. Bulk operations (import, export) must not impact interactive API performance." },
              { label: "Search Performance", detail: "Full-text search across all customer fields must return results in under 2 seconds for up to 100,000 records." },
              { label: "Uptime SLA", detail: "99.9% uptime SLA (maximum 8.7 hours downtime per year). Scheduled maintenance windows must be communicated 72 hours in advance." },
              { label: "Message Throughput", detail: "Support sending 1,000+ messages per hour across all channels combined. Queue management for burst scenarios (e.g., monthly statement reminders)." },
            ]}
          />

          <ExpandableSection
            number="10"
            title="User Experience & Training"
            icon={BookOpen}
            items={[
              { label: "Mobile Responsive", detail: "Full CRM functionality accessible from mobile browsers. Staff must be able to respond to messages and update cases from smartphones." },
              { label: "Onboarding Programme", detail: "Structured training programme for 10-15 staff members. Role-specific training paths. Video tutorials and searchable documentation." },
              { label: "Localisation", detail: "English as primary language. Support for Shona language in customer-facing templates and automated messages." },
              { label: "Customisable Dashboard", detail: "Each user role should have a default dashboard that can be personalised. Widgets for: my cases, my tasks, team performance, recent activity." },
              { label: "Keyboard Shortcuts", detail: "Power-user keyboard shortcuts for common actions: reply, assign, close, next case. Reduces time-per-action for high-volume agents." },
              { label: "Offline Mode", detail: "Basic read access to customer data when offline. Queue actions (notes, status updates) for sync when connection is restored." },
            ]}
          />
        </div>

        {/* ── Data Model Overview ── */}
        <SectionDivider label="Data Architecture" />
        <div className="grid md:grid-cols-2 gap-12 items-start mb-16">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold text-[hsl(160,70%,15%)] mb-4">Entity Relationship Overview</h2>
            <p className="text-base text-[hsl(160,70%,15%)]/60 leading-relaxed mb-6">
              Stand Number is the anchor entity in our data model. All customer interactions, payments, documents, 
              and communications are linked to a Stand. Below is a simplified view of the core entities the CRM must model.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800 leading-relaxed">
                <strong>⚠️ Important:</strong> This is a conceptual overview only. Actual database schema, table names, 
                column definitions, and foreign key relationships are available in the <a href="/crm-specs/technical" className="underline font-semibold">Technical Deep-Dive</a> document. 
                No customer data is included.
              </p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-6">
            <h3 className="text-base font-bold text-[hsl(160,70%,15%)] mb-4 flex items-center gap-2">
              <Database className="w-4 h-4" /> Core Entities
            </h3>
            <div className="space-y-3">
              {[
                { entity: "Stand (Account)", desc: "Primary entity. Unique identifier for each land plot.", fields: "Stand Number, Phase, Size, Status, Price, Payment Plan" },
                { entity: "Contact (Customer)", desc: "Individual person linked to one or more stands.", fields: "Name, Phone(s), Email, Country, ID Number, Category" },
                { entity: "Conversation", desc: "Threaded communication record.", fields: "Channel, Status, Assigned Agent, Messages, Notes" },
                { entity: "Payment Record", desc: "Individual payment transaction (read from ledger).", fields: "Amount, Date, Receipt, Method, Status" },
                { entity: "Support Case", desc: "Customer issue or request.", fields: "Case #, Type, Priority, SLA, Status, Resolution" },
                { entity: "Collections Action", desc: "Outreach attempt for overdue accounts.", fields: "Type, Channel, Tone, Outcome, Follow-up Date" },
                { entity: "Document", desc: "Files associated with a stand/customer.", fields: "Type, Upload Date, Version, Access Level" },
                { entity: "Audit Entry", desc: "Immutable log of all system actions.", fields: "Actor, Action, Entity, Timestamp, IP" },
              ].map((e) => (
                <div key={e.entity} className="border border-[hsl(160,10%,90%)] rounded-xl p-4">
                  <div className="font-semibold text-sm text-[hsl(160,70%,15%)]">{e.entity}</div>
                  <div className="text-xs text-[hsl(160,70%,15%)]/50 mb-1">{e.desc}</div>
                  <div className="text-xs text-[hsl(160,70%,15%)]/40 font-mono">{e.fields}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Implementation Phases ── */}
        <SectionDivider label="Implementation Roadmap" />
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-[hsl(160,70%,15%)] mb-3">Phased Rollout Plan</h2>
          <p className="text-base text-[hsl(160,70%,15%)]/50 max-w-2xl mx-auto">
            A pragmatic approach that delivers value incrementally while minimising disruption to ongoing operations.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <PhaseCard
            phase="P1"
            title="Foundation & Migration"
            subtitle="Weeks 1–6"
            color="hsl(160,70%,15%)"
            active
            items={[
              "Import existing customer profiles (profiles table)",
              "Set up role-based access matching our hierarchy",
              "Configure Twilio SMS/WhatsApp integration",
              "Configure Resend email integration",
              "Migrate conversation history and internal notes",
              "Establish Google Sheets ↔ CRM sync for payment data",
              "Train core team (3-5 super admins)",
            ]}
          />
          <PhaseCard
            phase="P2"
            title="Workflows & Automation"
            subtitle="Weeks 7–12"
            color="hsl(160,50%,30%)"
            items={[
              "Build collections pipeline and escalation workflows",
              "Configure automated payment reminders",
              "Set up SLA management for support cases",
              "Implement customer onboarding automation sequence",
              "Deploy AI-assisted outreach for collections",
              "Build custom reporting dashboards",
              "Train full staff (10-15 users)",
            ]}
          />
          <PhaseCard
            phase="P3"
            title="Scale & Optimise"
            subtitle="Weeks 13–20"
            color="hsl(38,70%,55%)"
            items={[
              "Performance tuning for 10,000+ records",
              "Advanced analytics and BI integration",
              "Customer self-service portal integration",
              "Multi-language support (English + Shona)",
              "Mobile app or PWA optimisation for field agents",
              "API integration with planned Payment Gateway",
              "Full audit and compliance review",
            ]}
          />
        </div>

        {/* ── Evaluation Criteria ── */}
        <SectionDivider label="Partner Evaluation" />
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-8">
            <h3 className="text-2xl font-bold text-[hsl(160,70%,15%)] mb-4">What We're Looking For</h3>
            <div className="space-y-4">
              {[
                { label: "Integration Capability", desc: "Proven ability to integrate with PostgreSQL, Twilio, Resend, and Google Sheets. REST API with webhook support.", weight: "30%" },
                { label: "Scalability", desc: "Demonstrated capacity to handle 10,000–100,000 records with sub-2-second search. High-availability architecture.", weight: "20%" },
                { label: "Security & Compliance", desc: "SOC 2 Type II. GDPR support. Field-level encryption. Comprehensive audit trail. Regular penetration testing.", weight: "20%" },
                { label: "Total Cost of Ownership", desc: "Transparent pricing. No hidden fees for API calls, integrations, or storage. Predictable scaling costs.", weight: "15%" },
                { label: "Implementation Speed", desc: "Ability to deliver Phase 1 within 6 weeks. Dedicated implementation support. Structured training programme.", weight: "15%" },
              ].map((c) => (
                <div key={c.label} className="flex gap-4">
                  <div className="w-14 h-8 rounded-lg bg-[hsl(160,70%,15%)]/10 text-[hsl(160,70%,15%)] text-xs font-bold flex items-center justify-center shrink-0">
                    {c.weight}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[hsl(160,70%,15%)]">{c.label}</div>
                    <div className="text-sm text-[hsl(160,70%,15%)]/60">{c.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-8">
            <h3 className="text-2xl font-bold text-[hsl(160,70%,15%)] mb-4">RFI Response Requirements</h3>
            <p className="text-sm text-[hsl(160,70%,15%)]/60 mb-4">
              Please include the following in your response to this brief:
            </p>
            <ul className="space-y-3">
              {[
                "Company overview and relevant case studies (land/property sector preferred)",
                "Proposed solution architecture and technology stack",
                "Integration approach for each system listed in Section 7",
                "Data migration methodology and timeline estimate",
                "Security certifications and compliance documentation",
                "Pricing model: per-user, per-record, flat-rate, or hybrid",
                "Implementation timeline with milestone deliverables",
                "Support model: SLA tiers, response times, escalation paths",
                "References from 2+ clients with similar scale/complexity",
                "Sandbox or demo environment for evaluation",
                "Data ownership and exit strategy terms",
                "Training programme outline and materials",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-[hsl(160,70%,15%)]/70">
                  <span className="text-xs font-mono text-[hsl(160,70%,15%)]/30 mt-0.5 shrink-0">{(i + 1).toString().padStart(2, "0")}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Contact & Questions ── */}
        <SectionDivider label="Questions & Contact" />
        <div id="questions" className="grid md:grid-cols-2 gap-8 mb-16">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold text-[hsl(160,70%,15%)] mb-4">Have Questions?</h2>
            <p className="text-base text-[hsl(160,70%,15%)]/60 leading-relaxed mb-6">
              Use the form to submit technical or commercial questions. All questions will be shared with 
              qualified respondents to ensure a fair evaluation process. Responses will be provided within 
              <strong> 2 business days</strong>.
            </p>
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-[hsl(160,10%,90%)] p-6">
                <h3 className="text-base font-bold text-[hsl(160,70%,15%)] mb-3">Primary Contacts</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[hsl(160,70%,15%)]/10 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-[hsl(160,70%,15%)]" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[hsl(160,70%,15%)]">Alex</div>
                      <div className="text-xs text-[hsl(160,70%,15%)]/50">alex@lakecity.co.zw</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[hsl(160,70%,15%)]/10 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-[hsl(160,70%,15%)]" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[hsl(160,70%,15%)]">Tanaka</div>
                      <div className="text-xs text-[hsl(160,70%,15%)]/50">tanaka@lakecity.co.zw</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-800 leading-relaxed">
                  <strong>🚫 Strict Confidentiality:</strong> This document and all related communications are 
                  confidential. Do not share with any third party without written authorisation from Lake City Development. 
                  No customer data (names, phone numbers, emails, stand numbers, balances) is included in this document.
                </p>
              </div>
            </div>
          </div>
          <QuestionForm />
        </div>

        {/* Footer */}
        <div className="border-t border-[hsl(160,10%,90%)] mt-16 pt-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <img src={logoWordmark} alt="StandLedger" className="h-5 mb-2" />
              <p className="text-xs text-[hsl(160,70%,15%)]/30">Warwickshire Pvt Ltd · Harare, Zimbabwe · Confidential — CRM Implementation RFI</p>
            </div>
            <a href="/crm-specs/technical">
              <Button className="bg-[hsl(160,70%,15%)] hover:bg-[hsl(160,70%,20%)] text-white">
                <Database className="w-4 h-4 mr-2" /> Technical Deep-Dive <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CrmSpecifications;
