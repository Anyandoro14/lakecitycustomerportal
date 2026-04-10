# Payment Orchestration V2

## New Provider-Agnostic Pipeline

1. Provider webhook (`paystack-webhook`, `paypal-webhook`, `flutterwave-webhook`) validates signature.
2. Provider webhook normalizes payload and forwards to `payment-webhook-handler`.
3. `payment-webhook-handler` writes:
   - `payment_webhook_events` (idempotency + replay)
   - `payment_transactions_v2` (canonical state machine)
   - `payment_receipts` (for portal compatibility when captured)
   - `loan_events` and `loan_balances` updates (when loan context exists)

## Initiating Payments

`payment-adapter-router` creates `payment_intents` and returns provider-specific checkout metadata.

## Idempotency Keys

- Webhook event: `<provider>:<provider_event_id>`
- Transaction: `tx:<provider>:<provider_event_id>`
- Legacy compatibility receipt path keeps provider reference unique per transaction where possible.

## Provider Secret Names

Vault secret key naming convention per tenant:

- `paystack_webhook_secret_<tenant_id>`
- `paypal_webhook_secret_<tenant_id>`
- `flutterwave_webhook_secret_<tenant_id>`
- Existing:
  - `kuva_webhook_secret_<tenant_id>`
  - `odoo_webhook_secret_<tenant_id>`
  - `receipt_intake_webhook_secret_<tenant_id>`
