# BNPL CRM V2 Baseline Map

This document maps current production entities and APIs to the v2 BNPL + CRM model without breaking the existing Customer Portal response contract.

## Existing -> V2 Entity Mapping

| Existing Entity | Current Purpose | V2 Entity |
| --- | --- | --- |
| `profiles` | Customer identity/profile | `crm_contacts` (linked), `loan_applications` applicant profile snapshot |
| `contracts` | Core loan-like contract metadata | `loans` |
| `installments` | Due schedule rows | `loan_schedules` |
| `payment_receipts` | Receipt ingestion/QC output | `payment_transactions_v2`, `loan_events`, `payment_allocations` |
| `contract_balances` | Current aggregate balance view | `loan_balances` |
| `support_cases` | Customer support tickets | `crm_cases` |
| `conversations`, `messages` | Channel conversations | `crm_activities` timeline ingestion |
| `internal_users` | Internal staff/RBAC | unchanged (tenant staff control plane) |
| `audit_log` | Operational audit | unchanged + extended for v2 money events |

## Existing APIs -> V2 Compatibility

| Existing API | Current Contract | V2 Strategy |
| --- | --- | --- |
| `fetch-customer-data` | Returns `stands[]` with legacy shape consumed by portal UI | Keep payload unchanged; source data from v2 compatibility views when feature flag is enabled |
| `kuva-webhook` | Creates approved receipts + installment mark paid | Keep existing behavior; add dual-write into v2 payment and loan event models |
| `receipt-intake-webhook` | Creates pending QC receipts | Keep existing behavior; dual-write with `pending_qc` state in v2 transaction pipeline |
| `odoo-webhook` | Contract/payment sync from Odoo | Keep existing behavior; add v2 Odoo sync queue and mapping links |
| `odoo-sync-payment` | Push approved receipts to Odoo | Keep function entrypoint; enrich with v2 transaction identifiers |

## Zero-Break Rules

1. No existing table is dropped or renamed.
2. Existing edge function names and request/response contracts are preserved.
3. V2 schema is additive and tenant-scoped.
4. Compatibility views provide old dashboard fields from v2 models.
5. Read-path migration is controlled by tenant feature flags.
