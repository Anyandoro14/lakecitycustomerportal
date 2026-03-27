import { useState } from "react";
import {
  Lock, Shield, Eye, EyeOff, ArrowLeft, Check, Database, Server,
  Key, FileText, GitBranch, AlertTriangle, Layers, Link2, Clock
} from "lucide-react";
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
          <h1 className="text-3xl font-bold text-white mb-2">Technical Deep-Dive</h1>
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

/* ─────────────────── Table Schema Block ─────────────────── */
const TableSchema = ({ name, description, columns }: {
  name: string; description: string; columns: { name: string; type: string; note: string }[];
}) => (
  <div className="mb-8 bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
    <div className="bg-gray-100 px-6 py-3 border-b border-gray-200">
      <code className="text-sm font-bold text-black">{name}</code>
      <p className="text-xs text-black/50 mt-0.5">{description}</p>
    </div>
    <div className="px-6 py-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-black/40 uppercase tracking-wider">
            <th className="pb-2 pr-4">Column</th>
            <th className="pb-2 pr-4">Type</th>
            <th className="pb-2">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {columns.map((col) => (
            <tr key={col.name}>
              <td className="py-2 pr-4 font-mono text-xs text-black/80">{col.name}</td>
              <td className="py-2 pr-4 font-mono text-xs text-black/50">{col.type}</td>
              <td className="py-2 text-xs text-black/50">{col.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/* ─────────────────── Main Page ─────────────────── */
const CrmTechnicalSpecs = () => {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-black/10">
        <div className="max-w-4xl mx-auto px-8 py-8">
          <a href="/crm-specs" className="inline-flex items-center gap-2 text-sm text-black/40 hover:text-black/70 transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to CRM Specifications
          </a>
          <div className="flex items-center gap-3 mb-4">
            <img src={logoWordmark} alt="StandLedger" className="h-6" />
            <span className="text-black/20">|</span>
            <span className="text-xs font-mono text-black/40 uppercase tracking-widest">Technical Deep-Dive</span>
          </div>
          <h1 className="text-3xl font-bold text-black mb-2">CRM Integration — Technical Architecture & Data Model</h1>
          <div className="flex flex-wrap gap-3 mt-4">
            {["Confidential", "March 2026", "v1.0", "Technical Specification"].map((tag) => (
              <span key={tag} className="border border-black/10 text-black/50 text-xs font-medium px-3 py-1 rounded-full">{tag}</span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-8 py-12">
        {/* ── 1. Database Schema ── */}
        <SpecSection
          number="1"
          title="Database Schema Overview"
          items={[
            "The StandLedger platform uses PostgreSQL with Row-Level Security (RLS) enforced on every table. The CRM must integrate with this existing schema — not replace it.",
            "Stand Number (text, e.g. '3081') is the canonical customer identifier across all systems. All CRM entities must support linking to Stand Number as a foreign reference.",
            "User identity is managed via Supabase Auth (auth.users table). Internal staff are tracked in a separate 'internal_users' table with role-based access.",
            "All timestamps are stored as 'timestamp with time zone' in UTC. The CRM must handle timezone conversion for display purposes.",
            "UUIDs (v4) are used as primary keys for all tables. The CRM must support UUID-type foreign keys for cross-system references.",
            "The following sections detail the core tables the CRM must read from, write to, or synchronise with. Column names, types, and constraints are production-accurate.",
          ]}
        />

        {/* ── 2. Core Tables ── */}
        <section className="mb-12">
          <div className="flex items-baseline gap-3 mb-6 border-b border-black/10 pb-3">
            <span className="text-sm font-mono text-black/40">2</span>
            <h2 className="text-xl font-bold text-black">Core Table Schemas (Subset — No Customer Data)</h2>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
            <p className="text-sm text-amber-800 leading-relaxed">
              <strong>⚠️ Privacy Notice:</strong> All schemas below are structural definitions only. No customer 
              data (names, emails, phone numbers, stand numbers, balances) is included. Sample values shown are 
              synthetic placeholders.
            </p>
          </div>

          <TableSchema
            name="public.profiles"
            description="Customer profile data linked to auth.users via ID. One row per registered customer."
            columns={[
              { name: "id", type: "uuid (PK)", note: "References auth.users(id)" },
              { name: "email", type: "text", note: "Customer email address" },
              { name: "full_name", type: "text", note: "Display name" },
              { name: "stand_number", type: "text", note: "Primary stand identifier (e.g. '1042')" },
              { name: "phone_number", type: "text", note: "Primary phone (E.164 format)" },
              { name: "phone_number_2", type: "text", note: "Secondary phone (optional)" },
              { name: "payment_start_date", type: "date", note: "When payment plan began" },
              { name: "created_at", type: "timestamptz", note: "Registration timestamp" },
              { name: "updated_at", type: "timestamptz", note: "Last profile update" },
            ]}
          />

          <TableSchema
            name="public.conversations"
            description="CRM conversation threads. One per customer contact channel combination."
            columns={[
              { name: "id", type: "uuid (PK)", note: "Unique conversation identifier" },
              { name: "stand_number", type: "text", note: "Linked stand (nullable for unresolved)" },
              { name: "customer_name", type: "text", note: "Cached display name" },
              { name: "customer_category", type: "text", note: "Active, Defaulter, etc." },
              { name: "primary_phone", type: "text", note: "Primary contact phone" },
              { name: "primary_email", type: "text", note: "Primary contact email" },
              { name: "status", type: "enum", note: "open | pending_customer | pending_internal | closed" },
              { name: "assigned_to_user_id", type: "uuid", note: "References internal staff member" },
              { name: "unread_count", type: "integer", note: "Unread messages counter" },
              { name: "last_message_at", type: "timestamptz", note: "Most recent message timestamp" },
              { name: "created_at", type: "timestamptz", note: "Conversation created" },
              { name: "updated_at", type: "timestamptz", note: "Last activity" },
            ]}
          />

          <TableSchema
            name="public.messages"
            description="Individual messages within conversations. Supports multi-channel."
            columns={[
              { name: "id", type: "uuid (PK)", note: "Unique message identifier" },
              { name: "conversation_id", type: "uuid (FK)", note: "Parent conversation" },
              { name: "direction", type: "enum", note: "inbound | outbound" },
              { name: "channel", type: "enum", note: "whatsapp | sms | email" },
              { name: "body", type: "text", note: "Message content" },
              { name: "delivery_status", type: "enum", note: "queued | sent | delivered | read | failed" },
              { name: "created_by_user_id", type: "uuid", note: "Staff member who sent (outbound only)" },
              { name: "provider_message_id", type: "text", note: "Twilio/Resend message ID" },
              { name: "sent_at", type: "timestamptz", note: "When message was sent" },
              { name: "received_at", type: "timestamptz", note: "When inbound message arrived" },
              { name: "raw_payload", type: "jsonb", note: "Raw webhook payload from provider" },
            ]}
          />

          <TableSchema
            name="public.support_cases"
            description="Customer support tickets with categorisation and SLA tracking."
            columns={[
              { name: "id", type: "uuid (PK)", note: "Unique case identifier" },
              { name: "case_number", type: "text", note: "Human-readable (e.g. LC-000042)" },
              { name: "user_id", type: "uuid", note: "Customer who raised the case" },
              { name: "first_name", type: "text", note: "Customer first name" },
              { name: "last_name", type: "text", note: "Customer last name" },
              { name: "email", type: "text", note: "Contact email for case" },
              { name: "issue_type", type: "text", note: "Top-level category" },
              { name: "sub_issue", type: "text", note: "Specific issue sub-type" },
              { name: "description", type: "text", note: "Case description" },
              { name: "status", type: "text", note: "open | in_progress | resolved | closed" },
              { name: "priority", type: "text", note: "low | medium | high | urgent" },
              { name: "preferred_contact_method", type: "text", note: "email | whatsapp" },
              { name: "whatsapp_number", type: "text", note: "WhatsApp contact (optional)" },
              { name: "created_at", type: "timestamptz", note: "Case created" },
              { name: "updated_at", type: "timestamptz", note: "Last update" },
            ]}
          />

          <TableSchema
            name="public.collections_notes"
            description="Notes and follow-ups attached to stands for collections tracking."
            columns={[
              { name: "id", type: "uuid (PK)", note: "Unique note identifier" },
              { name: "stand_number", type: "text", note: "Stand this note relates to" },
              { name: "content", type: "text", note: "Note body text" },
              { name: "note_type", type: "text", note: "note | call | follow_up | promise_to_pay" },
              { name: "follow_up_date", type: "date", note: "Scheduled follow-up (optional)" },
              { name: "created_by", type: "uuid", note: "Staff member who created" },
              { name: "created_by_email", type: "text", note: "Staff email (cached)" },
              { name: "created_at", type: "timestamptz", note: "When note was created" },
            ]}
          />

          <TableSchema
            name="public.collections_outreach"
            description="Record of outreach attempts for overdue accounts."
            columns={[
              { name: "id", type: "uuid (PK)", note: "Unique outreach identifier" },
              { name: "stand_number", type: "text", note: "Target stand" },
              { name: "customer_name", type: "text", note: "Cached customer name" },
              { name: "outreach_type", type: "text", note: "reminder | notice | escalation" },
              { name: "channel", type: "text", note: "sms | whatsapp | email" },
              { name: "tone", type: "text", note: "gentle | professional | formal" },
              { name: "message_body", type: "text", note: "Actual message content sent" },
              { name: "delivery_status", type: "text", note: "sent | delivered | failed" },
              { name: "provider_message_id", type: "text", note: "Twilio/Resend reference" },
              { name: "sent_by", type: "uuid", note: "Staff member who initiated" },
              { name: "sent_by_email", type: "text", note: "Staff email (cached)" },
              { name: "created_at", type: "timestamptz", note: "When outreach was sent" },
            ]}
          />

          <TableSchema
            name="public.internal_users"
            description="Internal staff with role-based access control."
            columns={[
              { name: "id", type: "uuid (PK)", note: "Row identifier" },
              { name: "user_id", type: "uuid (UNIQUE)", note: "References auth.users(id)" },
              { name: "email", type: "text", note: "Staff email" },
              { name: "full_name", type: "text", note: "Display name" },
              { name: "role", type: "enum", note: "helpdesk | admin | super_admin | director" },
              { name: "is_override_approver", type: "boolean", note: "Can approve overrides" },
              { name: "force_password_change", type: "boolean", note: "Require password reset on next login" },
              { name: "created_at", type: "timestamptz", note: "Account created" },
              { name: "updated_at", type: "timestamptz", note: "Last update" },
            ]}
          />

          <TableSchema
            name="public.audit_log"
            description="Immutable audit trail of all administrative actions."
            columns={[
              { name: "id", type: "uuid (PK)", note: "Unique log entry" },
              { name: "action", type: "text", note: "Action performed (e.g. 'customer_search')" },
              { name: "entity_type", type: "text", note: "Entity type (e.g. 'customer', 'case')" },
              { name: "entity_id", type: "text", note: "Target entity identifier" },
              { name: "performed_by", type: "uuid", note: "Staff member who performed action" },
              { name: "performed_by_email", type: "text", note: "Staff email (cached)" },
              { name: "details", type: "jsonb", note: "Action-specific metadata" },
              { name: "ip_address", type: "text", note: "Client IP address" },
              { name: "created_at", type: "timestamptz", note: "Action timestamp" },
            ]}
          />

          <TableSchema
            name="public.contact_stand_mappings"
            description="Maps phone/email identifiers to stand numbers for conversation routing."
            columns={[
              { name: "id", type: "uuid (PK)", note: "Row identifier" },
              { name: "contact_identifier", type: "text", note: "Phone number or email address" },
              { name: "contact_type", type: "text", note: "phone | email" },
              { name: "stand_number", type: "text", note: "Associated stand" },
              { name: "created_by", type: "uuid", note: "Staff who created mapping" },
              { name: "created_by_email", type: "text", note: "Staff email (cached)" },
              { name: "created_at", type: "timestamptz", note: "When mapping was created" },
            ]}
          />
        </section>

        {/* ── 3. Enums ── */}
        <SpecSection
          number="3"
          title="Enumerated Types"
          items={[
            "conversation_status: 'open' | 'pending_customer' | 'pending_internal' | 'closed' — Tracks the state of each conversation thread.",
            "delivery_status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' — Message delivery lifecycle tracking.",
            "internal_role: 'helpdesk' | 'admin' | 'super_admin' | 'director' — Role hierarchy for staff access control. CRM must respect this hierarchy.",
            "message_channel: 'whatsapp' | 'sms' | 'email' — Supported communication channels.",
            "message_direction: 'inbound' | 'outbound' — Whether message was sent by customer or staff.",
            "invitation_channel: 'email' | 'sms' | 'whatsapp' — Channel used to invite new customers to the portal.",
            "invitation_status: 'pending' | 'accepted' | 'expired' — Lifecycle of customer invitations.",
          ]}
        />

        {/* ── 4. RLS Policies ── */}
        <SpecSection
          number="4"
          title="Row-Level Security Model"
          items={[
            "Every table has RLS enabled. The CRM must authenticate as a specific user (not bypass RLS) unless using the service_role key for backend operations.",
            "Customer-facing tables (profiles, support_cases, monthly_statements) use auth.uid() = id or auth.uid() = user_id policies. Customers can only see their own data.",
            "Internal tables (conversations, messages, internal_notes, audit_log) use is_internal_user(auth.uid()) to restrict access to authenticated staff members.",
            "Security definer functions (is_internal_user, get_internal_role, is_override_approver) are used to avoid recursive RLS policy checks.",
            "The CRM's API connection must use one of: (a) service_role key for server-side operations, (b) user JWT for client-side operations respecting RLS, or (c) a dedicated database role with GRANT-based permissions.",
            "INSERT, UPDATE, DELETE policies are more restrictive than SELECT. Most tables are append-only for non-admin users. The audit_log table does not allow UPDATE or DELETE by any role.",
          ]}
        />

        {/* ── 5. API Integration ── */}
        <SpecSection
          number="5"
          title="API Integration Architecture"
          items={[
            "All backend logic runs as serverless Edge Functions (Deno runtime). The CRM should invoke these functions via the Supabase Functions SDK or direct HTTPS POST with API key authentication.",
            "Edge Functions are available at: https://{project_ref}.supabase.co/functions/v1/{function_name}. Authentication is via Bearer token (anon key for public, service_role for server).",
            "Existing Edge Functions the CRM may interact with: internal-portal-access (customer lookup), internal-send-message (send SMS/WhatsApp/Email), crm-conversations (conversation management), collections-ai-outreach (AI-generated collection messages).",
            "For direct database access, use the PostgREST API at https://{project_ref}.supabase.co/rest/v1/{table_name}. All requests must include the apikey header and Authorization Bearer token.",
            "Webhook endpoints can be configured via Edge Functions. The CRM should provide webhook URLs for the following events: contact created, contact updated, case status changed, message received.",
            "Rate limiting: The platform supports 500+ API calls per minute. Bulk operations should use batch endpoints where available. Exponential backoff is required for rate-limited responses (429).",
          ]}
        />

        {/* ── 6. Authentication ── */}
        <SpecSection
          number="6"
          title="Authentication & Authorisation"
          items={[
            "Customer auth: Email + password with SMS-based 2FA (Twilio Verify). Session tokens are JWTs issued by Supabase Auth with 1-hour expiry and refresh token rotation.",
            "Staff auth: Same flow but with additional internal_users table verification. Staff must exist in both auth.users and internal_users to access internal features.",
            "Role verification: The get_internal_role(uuid) function returns the staff member's role. The CRM must call this (or equivalent RPC) to determine permission level before allowing actions.",
            "SSO requirement: The CRM should support integration with our existing auth system. Staff should not maintain separate credentials. SAML 2.0 or OpenID Connect preferred.",
            "API authentication: Service-role key for server-to-server. Anon key + user JWT for client-side. Both keys are provided during onboarding — never embedded in client-facing code.",
            "Session management: 15-minute inactivity timeout. Configurable per role. Super Admins may override. All session events must be audit-logged.",
          ]}
        />

        {/* ── 7. Data Sync ── */}
        <SpecSection
          number="7"
          title="Google Sheets Integration (Collection Schedule)"
          items={[
            "The master payment ledger is a Google Sheet (Collection Schedule) with ~50 columns per row. Each row represents a stand with monthly payment columns spanning 36 months.",
            "Key columns: Stand Number (A), Customer Name (B), Phone Numbers (C-D), Email (E), Country (F), Monthly Amount (G), Outstanding Balance (H), Days Overdue (I), Payment Status (J), and monthly payment cells (K onwards).",
            "The CRM must read from this sheet to display payment data — it must NOT write payment data. Payments are the source of truth from the Google Sheet only.",
            "Access is via Google Sheets API v4 using a service account (JSON key). The service account email is pre-authorised on the sheet.",
            "Sync frequency recommendation: Every 15 minutes for balance/status data. Real-time webhook if the CRM needs instant payment notifications (we can build a trigger).",
            "The sheet structure may change (new columns added for future payment months). The CRM must handle schema evolution gracefully — column references should be by header name, not index.",
          ]}
        />

        {/* ── 8. Messaging Infrastructure ── */}
        <SpecSection
          number="8"
          title="Messaging Infrastructure"
          items={[
            "SMS: Twilio Messaging Service (SID-based routing for automatic sender selection). Supports international delivery to 10+ countries. Phone numbers must be E.164 format.",
            "WhatsApp: Twilio WhatsApp Business API. Dedicated number for outbound. Supports template messages (pre-approved by Meta) and session messages (within 24-hour window).",
            "Email: Resend API with verified domain lakecity.co.zw. Sender: 'LakeCity <noreply@lakecity.co.zw>'. Rate limit: 2 req/sec — sequential sending with 600ms delay required.",
            "Inbound routing: All inbound messages hit a webhook Edge Function. The function resolves the sender's phone/email to a Stand Number via contact_stand_mappings, then routes to the correct conversation.",
            "Delivery receipts: Twilio provides delivery status callbacks (StatusCallback URL). The CRM should update delivery_status on the messages table as callbacks arrive.",
            "Template variables: ${customer_name}, ${stand_number}, ${balance_due}, ${due_date}, ${days_overdue}, ${payment_amount}, ${agent_name}. All variables are resolved at send time from the customer's profile and ledger data.",
          ]}
        />

        {/* ── 9. Data Migration ── */}
        <SpecSection
          number="9"
          title="Data Migration Requirements"
          items={[
            "Migration scope: profiles (~70 records, growing), conversations (~200+), messages (~2,000+), support_cases (~50+), collections_notes (~300+), collections_outreach (~500+), audit_log (~5,000+).",
            "Migration must be idempotent — re-running should not create duplicates. Use UUIDs as natural dedup keys.",
            "All timestamps must be preserved exactly as stored (UTC). Do not re-generate created_at or updated_at during migration.",
            "Foreign key relationships must be maintained. conversation_id in messages must reference valid conversations. Stand numbers must match across tables.",
            "Validation step: Post-migration, run a reconciliation report comparing source and destination record counts, with field-level spot checks on 10% of records.",
            "Rollback plan: Full database snapshot before migration begins. Ability to restore to pre-migration state within 30 minutes.",
            "Zero-downtime requirement: Migration must not require portal downtime. Dual-write or change-data-capture approach recommended for the transition period.",
          ]}
        />

        {/* ── 10. Non-Functional Requirements ── */}
        <SpecSection
          number="10"
          title="Non-Functional Requirements"
          items={[
            "Response time: API endpoints must respond in <500ms for single-record operations and <2s for list/search operations (up to 100,000 records).",
            "Availability: 99.9% uptime SLA. Maintenance windows: Saturday 02:00–06:00 CAT only, with 72-hour advance notice.",
            "Backup: Automated daily backups. Point-in-time recovery with RPO ≤ 1 hour and RTO ≤ 4 hours. Off-site backup in separate geographic region.",
            "Monitoring: Real-time health dashboard. Alert on: API error rate > 1%, response time > 2s, disk usage > 80%, failed message delivery > 5%.",
            "Logging: Structured JSON logs with correlation IDs. Minimum 90-day retention. Searchable via API or dashboard. No PII in logs (mask phone/email).",
            "Scalability: Horizontal scaling to handle 10x traffic spikes (e.g., monthly statement day). Auto-scaling preferred. No manual intervention required.",
          ]}
        />

        {/* Footer */}
        <div className="border-t border-black/10 mt-16 pt-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <img src={logoWordmark} alt="StandLedger" className="h-5 mb-2" />
              <p className="text-xs text-black/30">Warwickshire Pvt Ltd · Harare, Zimbabwe · Confidential — Technical Specification</p>
            </div>
            <a href="/crm-specs">
              <Button variant="outline" className="text-sm">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to CRM Specifications
              </Button>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CrmTechnicalSpecs;
