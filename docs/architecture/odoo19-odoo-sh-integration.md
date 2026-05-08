# Odoo 19 + Odoo.sh integration notes

## Odoo module target

- Module: `odoo/addons/lakecity_loan_management`
- Version: `19.0.1.0.0`
- Runtime target: Odoo 19 on Odoo.sh

## Odoo.sh prerequisites

1. Install module in Apps.
2. Set Odoo system parameter:
   - `lakecity_loan.api_token`

## Supabase adapter function

- Function: `odoo-loan-module-sync`
- Actions:
  - `upsert_contract`
  - `post_payment`
  - `fetch_contract`
  - `set_contract_status`

## Vault secrets per tenant

- `odoo_url_<tenant_id>` (Odoo.sh URL)
- `odoo_loan_api_token_<tenant_id>` (matches `lakecity_loan.api_token`)

## Security and reliability

- All Odoo REST calls use Bearer token auth.
- Adapter retries transient failures (429/5xx/timeouts) with backoff.
- Idempotency keys use external UIDs:
  - Contract: Supabase `contracts.id` -> Odoo `external_uid`
  - Payment: Supabase `payment_receipts.id` -> Odoo `external_uid`
