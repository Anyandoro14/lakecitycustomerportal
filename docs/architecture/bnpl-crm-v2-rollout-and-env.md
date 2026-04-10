# BNPL CRM V2 Rollout and Environment Guardrails

## Branching and Merge Safety

- Long-running integration branch: `feature/v2-loan-crm-foundation`.
- Implementation branches should merge into `feature/v2-loan-crm-foundation` first.
- `main` remains production-only.
- Production release flow: `feature/*` -> `feature/v2-loan-crm-foundation` -> `release/*` -> `main`.

## Environment Separation

- Use separate Supabase projects for `dev`, `staging`, and `prod`.
- Keep provider webhook secrets isolated per tenant and environment using:
  - Vault secrets
  - `integration_secret_registry` references
- Never reuse production credentials in non-production environments.

## Runtime Feature Flags

Feature flags are tenant- and environment-scoped:
- `v2_dual_write_enabled`
- `v2_shadow_read_enabled`
- `v2_customer_read_enabled`
- `v2_crm_app_enabled`

Rollout gates tracked in:
- `tenant_rollout_gates`
- `cutover_acceptance_gates`

## Production Cutover Controls

1. Enable `v2_dual_write_enabled` in staging.
2. Run `bootstrap_v2_loans_from_contracts(tenant_id)` once.
3. Enable `v2_shadow_read_enabled` and collect variance data.
4. Run `run-v2-reconciliation` until no critical variance remains.
5. Set acceptance gates to passed.
6. Enable `v2_customer_read_enabled` tenant-by-tenant.
7. Enable `v2_crm_app_enabled` for CRM app rollout.
