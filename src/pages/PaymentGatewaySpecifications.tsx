import { useState } from "react";
import { Lock, Shield, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import logoWordmark from "@/assets/logo-wordmark-sea-green.svg";

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
      const { data, error: fnError } = await supabase.functions.invoke("verify-proposal-access", {
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
          <h1 className="text-3xl font-bold text-white mb-2">Design Specifications</h1>
          <p className="text-white/50 text-sm">This document is password-protected.</p>
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
            {error && <p className="text-red-400 text-xs mb-3">Incorrect password.</p>}
            <Button type="submit" disabled={loading} className="w-full h-12 bg-white text-[hsl(160,70%,15%)] hover:bg-white/90 font-semibold text-sm">
              <Shield className="w-4 h-4 mr-2" /> {loading ? "Verifying…" : "Unlock Document"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─────────────────── Spec Section ─────────────────── */
const SpecSection = ({ number, title, items }: { number: string; title: string; items: string[] }) => (
  <section className="mb-12">
    <div className="flex items-baseline gap-3 mb-4 border-b border-black/10 pb-3">
      <span className="text-sm font-mono text-black/40">{number}</span>
      <h2 className="text-xl font-bold text-black">{title}</h2>
    </div>
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-[15px] leading-relaxed text-black/70">
          <span className="text-black/30 font-mono text-xs mt-1 shrink-0">{number}.{i + 1}</span>
          {item}
        </li>
      ))}
    </ul>
  </section>
);

/* ─────────────────── Main Page ─────────────────── */
const PaymentGatewaySpecifications = () => {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-black/10">
        <div className="max-w-4xl mx-auto px-8 py-8">
          <a href="/payment-gateway" className="inline-flex items-center gap-2 text-sm text-black/40 hover:text-black/70 transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Integration Proposal
          </a>
          <div className="flex items-center gap-3 mb-4">
            <img src={logoWordmark} alt="StandLedger" className="h-6" />
            <span className="text-black/20">|</span>
            <span className="text-xs font-mono text-black/40 uppercase tracking-widest">Design Specifications</span>
          </div>
          <h1 className="text-3xl font-bold text-black mb-2">Payment Infrastructure — Technical Integration Brief</h1>
          <div className="flex flex-wrap gap-3 mt-4">
            {["Confidential", "March 2026", "v1.0", "RFP Document"].map((tag) => (
              <span key={tag} className="border border-black/10 text-black/50 text-xs font-medium px-3 py-1 rounded-full">{tag}</span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-8 py-12">
        <SpecSection
          number="1"
          title="Functional Requirements"
          items={[
            "Support free-text payment amount entry with validation against outstanding balance and minimum instalment (Column K).",
            "Conditionally render payment methods based on customer's registered country of residence.",
            "Support payment statuses: Pending, Processing, Settled, Failed, Refunded.",
            "Generate unique transaction reference for each payment attempt.",
            "Pre-populate customer name and stand number from authenticated session.",
            "Support partial payments — customer may pay less than full balance but not less than minimum instalment.",
            "Display payment confirmation with downloadable receipt.",
            "All successful payments must flow into Receipt Intake pipeline before ledger update.",
            "Feature-flag controlled: entire payment module must be independently toggleable without affecting portal functionality.",
          ]}
        />

        <SpecSection
          number="2"
          title="Non-Functional Requirements"
          items={[
            "99.9% uptime SLA for payment processing endpoints.",
            "Payment page load time under 2 seconds on 3G connections.",
            "Support minimum 100 concurrent payment sessions.",
            "Mobile-first responsive design — 70%+ of users access via smartphone.",
            "Graceful degradation: if gateway is unavailable, show guided bank transfer instructions.",
            "Multi-language support roadmap (English primary, Shona secondary).",
            "Audit trail for every payment event with timestamp and actor.",
          ]}
        />

        <SpecSection
          number="3"
          title="Security & Tokenization"
          items={[
            "PCI DSS Level 1 compliance mandatory — no exceptions.",
            "All payment credentials must be tokenized at the gateway level.",
            "No raw card numbers, CVVs, or bank account details stored on LakeCity infrastructure.",
            "TLS 1.2+ required for all API communications.",
            "Webhook payloads must be signed (HMAC-SHA256 minimum) for verification.",
            "Support 3D Secure 2.0 for card payments where applicable.",
            "Session-bound payment tokens with maximum 15-minute validity.",
            "IP-restricted API access for production webhook endpoints.",
          ]}
        />

        <SpecSection
          number="4"
          title="Geo Compliance Requirements"
          items={[
            "Canada: Payments Canada EFT rules for Interac/PAD transactions.",
            "United States: NACHA Operating Rules for ACH transfers.",
            "United Kingdom: PSD2 / Strong Customer Authentication (SCA) for card and Open Banking flows.",
            "Australia: BECS Direct Debit rules for PayID and direct debit transactions.",
            "All geographies: Anti-Money Laundering (AML) screening as required by jurisdiction.",
            "Cross-border: Compliance with FATF recommendations for international fund transfers.",
            "Zimbabwe: Reserve Bank of Zimbabwe foreign currency regulations for inbound USD settlement.",
          ]}
        />

        <SpecSection
          number="5"
          title="API & Webhook Standards"
          items={[
            "RESTful API with OpenAPI 3.0 / Swagger documentation.",
            "JSON request/response format with consistent error schema.",
            "API versioning via URL path (e.g. /v1/payments).",
            "Webhook delivery within 30 seconds of payment event.",
            "Webhook retry schedule: 1min, 5min, 30min, 2hr, 24hr.",
            "Dead letter queue for permanently failed webhook deliveries.",
            "Rate limiting: minimum 100 requests/minute per merchant.",
            "Sandbox environment with simulated payment rails for all supported geographies.",
          ]}
        />

        <SpecSection
          number="6"
          title="Failure & Retry Scenarios"
          items={[
            "Gateway timeout: Display user-friendly error with option to retry or use alternative method.",
            "Duplicate submission prevention via client-side debounce and server-side idempotency.",
            "Network interruption during payment: System must be able to query transaction status and resume.",
            "Bank decline: Show specific decline reason (insufficient funds, card expired, etc.) where available.",
            "3DS challenge failure: Allow customer to retry with same or different card.",
            "Webhook delivery failure: Gateway must queue and retry; LakeCity must expose replay endpoint.",
            "Partial settlement: System must handle and surface partial payment amounts correctly.",
          ]}
        />

        <SpecSection
          number="7"
          title="Idempotency Policy"
          items={[
            "Every payment request must include a client-generated idempotency key (UUID v4).",
            "Gateway must return identical response for duplicate idempotency keys within 24-hour window.",
            "Idempotency key must be bound to: merchant ID + customer ID + amount + currency.",
            "Expired idempotency keys must return 409 Conflict, not create new transactions.",
            "Edge Functions must persist idempotency keys before calling gateway API.",
          ]}
        />

        <SpecSection
          number="8"
          title="Reconciliation Expectations"
          items={[
            "Daily settlement report available via API and/or CSV export by 06:00 UTC.",
            "Report must include: transaction ID, gateway reference, amount, currency, FX rate, fees, net settlement, status, timestamp.",
            "Support for date-range queries on transaction history (minimum 12-month retention).",
            "Discrepancy flag: Gateway must surface any transactions that differ between initiated and settled amounts.",
            "Monthly reconciliation summary with total volume, fee breakdown, and FX impact.",
          ]}
        />

        <SpecSection
          number="9"
          title="Settlement Timing"
          items={[
            "Target settlement: T+1 for card payments, T+2 for bank transfers.",
            "International wire / SWIFT: T+3 to T+5 acceptable with status visibility.",
            "Settlement currency: USD to CABS (Central Africa Building Society), Zimbabwe.",
            "Gateway must provide estimated settlement date at time of payment confirmation.",
            "Rolling reserve or holdback terms must be disclosed upfront in partnership agreement.",
          ]}
        />

        <SpecSection
          number="10"
          title="Data Ownership & Storage Policy"
          items={[
            "LakeCity retains full ownership of all transaction data and customer payment history.",
            "Gateway may not use LakeCity transaction data for any purpose beyond service delivery.",
            "Payment data must be stored in SOC 2 Type II compliant infrastructure.",
            "Data residency: Transaction records must be accessible from gateway's API indefinitely or exported on request.",
            "On contract termination: Full data export in machine-readable format (JSON/CSV) within 30 days.",
            "Customer PII handling must comply with GDPR (for UK customers) and POPIA (for South African customers).",
            "No third-party data sharing without explicit written consent from LakeCity.",
          ]}
        />

        {/* Footer */}
        <div className="border-t border-black/10 mt-16 pt-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <img src={logoWordmark} alt="StandLedger" className="h-5 mb-2" />
              <p className="text-xs text-black/30">Warwickshire Pvt Ltd · Harare, Zimbabwe · Confidential</p>
            </div>
            <a href="/payment-gateway">
              <Button variant="outline" className="text-sm">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Proposal
              </Button>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PaymentGatewaySpecifications;
