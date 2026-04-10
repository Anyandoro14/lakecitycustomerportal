# StandLedger — Architecture Summary

This document mirrors the product architecture. **Correct the repo** when behaviour changes; do not treat this file as the only source of truth for APIs (see Edge Function code and migrations).

---

### Frontend (React SPA)

| Aspect | Detail |
|--------|--------|
| **Stack** | React 18 + Vite 5 + TypeScript 5 + Tailwind CSS v3 |
| **UI library** | shadcn/ui (Radix primitives + CVA variants) |
| **Routing** | React Router v6 — public (`/login`, `/signup`, `/forgot-password`), customer (`/`, `/updates`, `/statements`, `/support`, `/settings`), internal (`/internal/*`, `/admin/*`, `/docs/*`) |
| **State** | TanStack Query for server state; React Context for tenant (`TenantContext`) and admin impersonation (`LookingGlassContext`) |
| **Auth flow** | Email + phone 2FA via Twilio Verify; internal staff auto-provisioned on `@lakecity.co.zw` domain; force-password-change gate; 2FA bypass codes for support |
| **Key customer pages** | `Index` (dashboard with payment summary, history, next-due), `MonthlyStatements`, `SupportRequest`, `AccountManagement`, `Updates` (articles) |
| **Key internal pages** | `InternalPortal` (user/invitation management), `CollectionsCommandCenter` (overdue tracking + AI outreach), `Reporting` (executive revenue), `QcQueue` (receipt approval), `TrainingCenter`, `ConversationsInbox` (CRM) |
| **Docs portal** | `/docs/*` — developer-style reference (Sheets & Tabs, Data Models, Glossary, API Reference, Webhooks, Authentication, Quickstart) |
| **Date formatting** | `date-fns` — prefer `d MMM yyyy` for display; avoid bare `toLocaleDateString()` without options in tables |

---

### Backend (Supabase)

#### Database (PostgreSQL)

Representative tables (not exhaustive — see `supabase/migrations/`):

| Table | Purpose |
|-------|---------|
| `profiles` | User metadata — `stand_number`, `payment_plan_months` (default 36), `payment_start_date`, phones |
| `internal_users` | Staff roster with `internal_role` + override flags |
| `support_cases` | Customer tickets with `LC-XXXXXX` case numbers |
| `conversations` / `messages` / `internal_notes` | CRM inbox threads |
| `collections_notes` / `collections_outreach` | Collections workflow |
| `articles` / `article_feedback` / `article_read_status` | Customer updates |
| `payment_transactions` | Gateway payment lifecycle |
| `monthly_statements` | Statement snapshots |
| `customer_invitations` | Token-based signup |
| `training_progress` / `training_chat_history` | Internal training |
| `twofa_bypass_codes` / `password_reset_tokens` | Auth utilities |
| `audit_log` | Compliance audit trail |

RLS: internal vs customer access patterns vary by table (see policies in migrations).

#### Edge Functions

Roughly **40** functions — categories include:

| Category | Examples |
|----------|----------|
| **Data** | `fetch-google-sheets`, `fetch-customer-data` |
| **Auth** | `register-user`, `validate-signup`, `send-2fa-code`, `verify-2fa-code`, `request-password-reset`, … |
| **Admin** | `manage-user-access`, `internal-portal-access`, … |
| **Payments** | `process-approved-receipts`, `scan-combined-deposits`, webhooks |
| **Sheets** | `write-cell`, `clear-cell`, `migrate-sheets-to-db`, `generate-installments` |
| **CRM** | `crm-conversations`, `incoming-message-webhook`, … |
| **Comms** | `send-customer-invitation`, `send-article-email`, `send-platform-report`, … |
| **Reporting** | `fetch-reporting-data`, `generate-monthly-statements`, … |

Deploy with `npm run supabase:deploy-functions` or `bash scripts/deploy-supabase-functions.sh` as documented in the repo.

#### External integrations

| Service | Use |
|---------|-----|
| **Google Sheets API** | Authoritative Collection Schedule + Receipts_Intake (per tenant) |
| **Twilio** | SMS/WhatsApp + Verify (2FA) |
| **Resend** | Transactional email |
| **Odoo** | ERP sync (where enabled) |

---

### Data flow (Collection Schedule → portal)

`fetch-google-sheets` reads the resolved tab (e.g. **`Collection Schedule - 36mo`**) using a **wide row range** (`A:ZZ`) so widened BNPL layouts are not truncated.

- **Identity / amounts:** columns A–L (Stand Number … payment start date).
- **Monthly ledger (repo templates):** **M–FX** — shared calendar **Jan 2022 – Dec 2035**; **FY** Next Payment marker (column letter formula); **FZ** TOTAL PAID; balance/progress follow.
- **Totals:** Portal uses **`profiles.payment_plan_months`** to cap how many month columns are interpreted, clamped to the column before **Next Payment** (see `collection-schedule-sheets.ts`).
- **Deposit:** Column **H** participates in BNPL totals (deposit + sum of month cells vs total price).

```
Customer session → fetch-google-sheets → Google Sheets API (Collection Schedule tab)
                    → Row values A:ZZ → header-based column resolution
                    → JSON (balances, history, agreement flags) → React dashboard
```

---

### Multi-tenant design

- `tenants` (and related) store per-tenant `spreadsheet_id`, branding, secrets.
- `tenant_id` on transactional rows where applicable; resolve tenant from host/domain in app and Edge Functions.

---

### Excel templates (operators)

Canonical path: **`docs/payment-schedule-templates/Payment Schedules - Customer Portal/`** — regenerate with **`bash docs/payment-schedule-templates/run-fix-templates.sh`**. Spec: **`BNPL_SCHEDULE_SPEC.md`**, **`COLLECTION_SCHEDULE_TEMPLATE_INSTRUCTIONS.md`**.

---

### Lovable / external codegen

Prompts for aligning generated UI with this architecture:

- **`docs/LOVABLE_PROMPT_PAYMENT_SCHEDULE_TEMPLATE_UPDATES.md`**
- **`docs/LOVABLE_PROMPT_COLLECTION_SCHEDULE_TABS.md`**
