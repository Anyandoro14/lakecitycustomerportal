# V2 Cutover Runbook (Dual-Write + Shadow-Read)

## Prerequisites

1. Apply migrations through `20260409075000_v2_crm_channel_bridge.sql`.
2. Deploy new functions:
   - `payment-adapter-router`
   - `payment-webhook-handler`
   - `paystack-webhook`
   - `paypal-webhook`
   - `flutterwave-webhook`
   - `crm-app-api`
   - `run-v2-reconciliation`
3. Register tenant/provider secrets in Vault and `integration_secret_registry`.

## Phase 1: Bootstrap and dual-write

1. Bootstrap loans from existing contracts:
   - `select public.bootstrap_v2_loans_from_contracts('<tenant_uuid>');`
2. Enable dual-write:
   - Set `v2_dual_write_enabled=true` in `tenant_feature_flags` for target tenant/env.
3. Confirm new receipts populate:
   - `payment_transactions_v2`
   - `loan_events`
   - `payment_allocations`

## Phase 2: Shadow-read

1. Enable `v2_shadow_read_enabled=true`.
2. Keep `v2_customer_read_enabled=false` (portal still reads legacy balances).
3. Call `run-v2-reconciliation` daily with service role:
   - payload: `{ "tenant_id": "<tenant_uuid>", "environment": "staging", "tolerance_amount": 0.01 }`
4. Review:
   - `reconciliation_runs`
   - `reconciliation_items`
   - `shadow_read_comparisons`
   - `cutover_acceptance_gates`

## Phase 3: Tenant cutover

1. Ensure acceptance gate `balance_variance_zero` is passed.
2. Enable `v2_customer_read_enabled=true` for internal pilot tenant.
3. Monitor support and financial reconciliations for at least one billing cycle.
4. Roll out tenant-by-tenant.
