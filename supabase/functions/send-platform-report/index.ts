import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email) throw new Error("Missing email address");

    const reportHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
  h1 { color: #0d4a3a; border-bottom: 3px solid #0d4a3a; padding-bottom: 12px; font-size: 24px; }
  h2 { color: #0d4a3a; margin-top: 32px; font-size: 18px; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; }
  h3 { color: #333; font-size: 15px; margin-top: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; font-size: 13px; }
  th { background: #0d4a3a; color: white; text-align: left; padding: 8px 12px; }
  td { padding: 8px 12px; border-bottom: 1px solid #e8e8e8; }
  tr:nth-child(even) td { background: #f8f8f8; }
  .badge-ready { background: #d4edda; color: #155724; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
  .badge-roadmap { background: #fff3cd; color: #856404; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
  .header { background: #0d4a3a; color: white; padding: 30px; text-align: center; margin: -40px -20px 30px; }
  .header h1 { color: white; border: none; margin: 0; font-size: 22px; }
  .header p { color: #a8d5c8; margin: 8px 0 0; font-size: 13px; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #0d4a3a; text-align: center; color: #888; font-size: 12px; }
</style>
</head>
<body>

<div class="header">
  <h1>Strategic Platform Analysis &amp; SaaS Enablement Report</h1>
  <p>Prepared by Michaelt Enablement &bull; 10 February 2026 &bull; Confidential</p>
</div>

<h2>1. Executive Summary</h2>
<p>The platform is a <strong>multi-tenant SaaS solution</strong> purpose-built for real estate businesses offering Buy Now, Pay Later (BNPL) land and property financing. It currently serves Lake City as its anchor tenant, with architecture designed for white-label deployment across multiple property developers and townships.</p>
<p><strong>Core Value Proposition:</strong> Eliminates manual office inquiries, prevents document loss, provides real-time financial visibility, and secures customer interactions via WhatsApp/SMS 2FA — all through a single, branded customer portal.</p>

<h2>2. Platform Architecture</h2>
<h3>2.1 Technology Stack</h3>
<table>
  <tr><th>Layer</th><th>Technology</th></tr>
  <tr><td>Frontend</td><td>React 18, TypeScript, Vite, Tailwind CSS</td></tr>
  <tr><td>UI Components</td><td>shadcn/ui (Radix primitives)</td></tr>
  <tr><td>Backend</td><td>Lovable Cloud — Edge Functions (Deno)</td></tr>
  <tr><td>Database</td><td>PostgreSQL with Row-Level Security</td></tr>
  <tr><td>Data Source</td><td>Google Sheets (Collection Schedule) as financial source of truth</td></tr>
  <tr><td>Auth</td><td>Email + WhatsApp/SMS 2FA, bypass codes</td></tr>
  <tr><td>Deployment</td><td>Lovable Cloud with PWA support</td></tr>
</table>

<h3>2.2 Multi-Tenant Design</h3>
<ul>
  <li>Single codebase, multi-tenant architecture</li>
  <li>Data isolation enforced via <code>tenant_id</code> + RLS policies</li>
  <li><code>tenants</code> table stores per-tenant branding, Google Sheet IDs, and provider credentials</li>
  <li>Dynamic white-labeling based on domain/subdomain detection</li>
</ul>

<h2>3. Feature Inventory</h2>
<h3>3.1 Customer-Facing</h3>
<table>
  <tr><th>Feature</th><th>Description</th></tr>
  <tr><td>Real-Time Dashboard</td><td>Live balance, payment status, days overdue/prepaid from Google Sheet (Column AZ)</td></tr>
  <tr><td>Monthly Statements</td><td>Auto-generated with rolling balance calculation, backward from current balance</td></tr>
  <tr><td>Document Center</td><td>Agreement of Sale, receipts, and supporting documents</td></tr>
  <tr><td>Payment History</td><td>Full transaction ledger with filtering</td></tr>
  <tr><td>Support Requests</td><td>Case submission with ticket tracking</td></tr>
  <tr><td>Onboarding Wizard</td><td>Guided first-time setup experience</td></tr>
  <tr><td>PWA Support</td><td>Installable on mobile devices</td></tr>
</table>

<h3>3.2 Internal / Admin</h3>
<table>
  <tr><th>Feature</th><th>Description</th></tr>
  <tr><td>CRM Conversations Inbox</td><td>Unified WhatsApp/SMS/Email inbox with assignment, internal notes, and ticket linking</td></tr>
  <tr><td>User Access Management</td><td>Role-based access (Helpdesk, Admin, Super Admin, Director)</td></tr>
  <tr><td>Customer Invitations</td><td>Email/SMS/WhatsApp invite flow with token-based acceptance</td></tr>
  <tr><td>2FA Bypass Code Generation</td><td>Admin-issued temporary bypass for locked-out customers</td></tr>
  <tr><td>Receipt Processing</td><td>Automated intake from Google Sheet with approval workflow (case-insensitive)</td></tr>
  <tr><td>Account Management</td><td>CRUD on user profiles, password resets, role changes</td></tr>
</table>

<h3>3.3 Reporting &amp; Analytics (FP&amp;A Grade)</h3>
<table>
  <tr><th>Feature</th><th>Description</th></tr>
  <tr><td>Executive Revenue Summary</td><td>Actual vs. Expected revenue separation, 3-month rolling averages</td></tr>
  <tr><td>Rolling 90-Day Framework</td><td>Previous 90d Actual → Current 90d Actual → Next 90d Expected</td></tr>
  <tr><td>Geographic Revenue</td><td>Country-level aggregation with drill-down filtering</td></tr>
  <tr><td>All Stands Overview</td><td>CSV-exportable table with overdue/prepaid indicators</td></tr>
  <tr><td>Dual-Axis Charts</td><td>Currency + percentage with solid (actual) vs. dashed (forecast) visual markers</td></tr>
</table>

<h2>4. Data Architecture</h2>
<h3>4.1 Database Tables (16 tables)</h3>
<p><code>profiles</code> · <code>internal_users</code> · <code>support_cases</code> · <code>monthly_statements</code> · <code>conversations</code> · <code>messages</code> · <code>internal_notes</code> · <code>customer_invitations</code> · <code>customer_onboarding</code> · <code>audit_log</code> · <code>contact_stand_mappings</code> · <code>conversation_assignments_audit</code> · <code>conversation_ticket_links</code> · <code>knowledge_base</code> · <code>password_reset_tokens</code> · <code>twofa_bypass_codes</code></p>

<h3>4.2 Edge Functions (28 deployed)</h3>
<p>Covering: user registration, 2FA, password resets, Google Sheets sync, receipt processing, CRM messaging, statement generation, reporting, customer invitations, and internal admin operations.</p>

<h3>4.3 Google Sheets Integration</h3>
<ul>
  <li>Acts as <strong>financial source of truth</strong> (Collection Schedule)</li>
  <li><code>fetch-google-sheets</code> reads live data; <code>write-cell</code> / <code>clear-cell</code> update it</li>
  <li>Balance sync logic: <code>currentBalance</code> (Column AZ) drives dashboard and statement generation</li>
</ul>

<h2>5. Security Posture</h2>
<table>
  <tr><th>Control</th><th>Implementation</th></tr>
  <tr><td>Authentication</td><td>Email + password with mandatory WhatsApp/SMS OTP</td></tr>
  <tr><td>2FA Bypass</td><td>Admin-generated, time-limited, audited codes</td></tr>
  <tr><td>RLS</td><td>All 16 tables enforce Row-Level Security</td></tr>
  <tr><td>Session Management</td><td>Configurable timeout with auto-logout</td></tr>
  <tr><td>Audit Trail</td><td>Full audit_log table tracking actions, IPs, and actors</td></tr>
  <tr><td>Role Hierarchy</td><td>Helpdesk → Admin → Super Admin → Director</td></tr>
  <tr><td>Password Policy</td><td>Force-change flag on first login for admin-created accounts</td></tr>
</table>

<h2>6. SaaS Enablement Readiness</h2>
<h3>6.1 Ready Now <span class="badge-ready">✅</span></h3>
<ul>
  <li>Multi-tenant data model with <code>tenant_id</code> isolation</li>
  <li>White-label branding per tenant</li>
  <li>Per-tenant Google Sheet configuration</li>
  <li>Role-based access control</li>
  <li>PWA-ready for mobile deployment</li>
</ul>

<h3>6.2 Roadmap Items <span class="badge-roadmap">🔄</span></h3>
<table>
  <tr><th>Item</th><th>Priority</th><th>Effort</th></tr>
  <tr><td>Tenant self-service onboarding portal</td><td>High</td><td>Medium</td></tr>
  <tr><td>Per-tenant billing &amp; subscription management (Stripe)</td><td>High</td><td>Medium</td></tr>
  <tr><td>Tenant-scoped analytics dashboard</td><td>Medium</td><td>Low</td></tr>
  <tr><td>Custom domain mapping per tenant</td><td>Medium</td><td>Low</td></tr>
  <tr><td>API rate limiting per tenant</td><td>Medium</td><td>Low</td></tr>
  <tr><td>Tenant data export / portability</td><td>Low</td><td>Low</td></tr>
</table>

<h2>7. Revenue Model Opportunity</h2>
<table>
  <tr><th>Model</th><th>Description</th></tr>
  <tr><td>SaaS Subscription</td><td>Monthly per-tenant fee tiered by stand count</td></tr>
  <tr><td>Transaction Fee</td><td>Per-receipt processing fee</td></tr>
  <tr><td>White-Label Premium</td><td>Custom branding, domain, and support SLA</td></tr>
  <tr><td>Reporting Add-On</td><td>FP&amp;A-grade analytics as premium tier feature</td></tr>
</table>

<h2>8. Key Metrics (Platform Health)</h2>
<table>
  <tr><th>Metric</th><th>Tracking Method</th></tr>
  <tr><td>Active tenants</td><td>tenants table</td></tr>
  <tr><td>Registered customers</td><td>profiles table</td></tr>
  <tr><td>Monthly statements generated</td><td>monthly_statements table</td></tr>
  <tr><td>Support cases</td><td>support_cases table</td></tr>
  <tr><td>CRM conversations</td><td>conversations table</td></tr>
  <tr><td>Receipt throughput</td><td>process-approved-receipts function logs</td></tr>
  <tr><td>Registration conversion</td><td>fetch-registration-stats function</td></tr>
</table>

<h2>9. Conclusion</h2>
<p>The platform is <strong>architecturally ready for multi-tenant SaaS deployment</strong> with strong security controls, FP&amp;A-grade reporting, and a proven operational model through the Lake City anchor tenant. The primary enablement gaps are tenant self-service onboarding and integrated billing — both addressable with the existing technology stack.</p>

<div class="footer">
  <p><strong>Michaelt Enablement</strong> — Confidential<br>Generated 10 February 2026</p>
</div>

</body>
</html>`;

    const emailResponse = await resend.emails.send({
      from: "LakeCity <onboarding@resend.dev>",
      to: [email],
      subject: "Strategic Platform Analysis & SaaS Enablement Report",
      html: reportHtml,
    });

    console.log("Report email sent:", emailResponse);

    return new Response(JSON.stringify({ success: true, ...emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending report:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
