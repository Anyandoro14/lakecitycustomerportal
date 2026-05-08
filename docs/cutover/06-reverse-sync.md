# Wire the reverse sync (Odoo → Supabase)

When staff posts a payment in Odoo, that payment must show up in the customer portal within seconds. The way: an Odoo automation rule fires `odoo-webhook` whenever a `lakecity.collection.payment` line gets paid, and the webhook upserts a row into `payment_receipts` so [`fetch-customer-data`](../../supabase/functions/fetch-customer-data/index.ts) returns the same shape it always has.

This step is split into two halves: code (already done) and Odoo configuration (operational).

## Code changes shipped in this PR

- New migration `20260507010000_payment_receipts_odoo_collection_payment.sql` — adds `odoo_collection_payment_id` and `odoo_collection_schedule_id` to `payment_receipts`, plus an idempotency index.
- `supabase/functions/odoo-webhook/index.ts` — new branches:
  - `case 'lakecity.collection.payment'` — upserts a receipt with `qc_status='approved'`, idempotent on `(tenant_id, odoo_collection_payment_id)`. Deletes the receipt if the cell is unpaid (handles "oops, unpost").
  - `case 'lakecity.collection.schedule'` — upserts a contract on `(tenant_id, stand_number)` if a brand-new schedule is created from Odoo (vs. pushed from Supabase by `odoo-push-schedule`).

After cutover commit lands on `main`, Lovable Cloud auto-deploys both changes.

## Odoo automation rules to configure

Set these up in production Odoo **after** the addon is installed and the historical XLSX import is verified.

### Rule 1: Sync paid collection payments → Supabase

In Odoo: **Settings → Technical → Automation Rules → Create**.

| Field | Value |
|---|---|
| Rule Name | `Sync Lakecity Payment to Supabase` |
| Model | `Collection Schedule Monthly Payment` (`lakecity.collection.payment`) |
| Trigger | `On Save` |
| Before Update Domain | `[]` |
| Apply on (filter) | `[('amount_paid', '>', 0)]` (only fires once a value lands in the cell) |

**Action**: Add a Python action with this code (Settings → Technical → Server Actions → Create):

```python
# Server Action: Post lakecity.collection.payment to Supabase odoo-webhook
# Bind to model `lakecity.collection.payment` and reference from the
# automation rule above.
import json
import urllib.request

WEBHOOK_URL = env['ir.config_parameter'].sudo().get_param(
    'lakecity_crm.webhook_url',
    'https://YOUR-LOVABLE-PROJECT.supabase.co/functions/v1/odoo-webhook'
)
WEBHOOK_BEARER = env['ir.config_parameter'].sudo().get_param(
    'lakecity_crm.webhook_bearer'
)

if not WEBHOOK_BEARER:
    raise UserError("Set System Parameter 'lakecity_crm.webhook_bearer' to the value of odoo_webhook_secret_<uuid> from Supabase Vault.")

for record in records:
    payload = {
        '_model': 'lakecity.collection.payment',
        '_id': record.id,
        'stand_number': record.stand_number,
        'schedule_id': [record.schedule_id.id, record.schedule_id.stand_number],
        'partner_id': [record.partner_id.id, record.partner_id.name] if record.partner_id else False,
        'due_date': record.due_date.isoformat() if record.due_date else False,
        'amount_paid': float(record.amount_paid or 0.0),
        'paid_date': record.paid_date.isoformat() if record.paid_date else False,
        'is_paid': bool(record.is_paid),
        'note': record.note or '',
    }
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {WEBHOOK_BEARER}',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
    except Exception as exc:
        # Don't fail the user's save - log and queue a retry.
        env['ir.logging'].sudo().create({
            'name': 'lakecity_crm.webhook',
            'type': 'server',
            'level': 'WARNING',
            'message': f'webhook POST failed: {exc}',
            'path': 'lakecity.collection.payment',
            'func': 'automation_rule',
            'line': '0',
        })
```

### Rule 2: Sync new collection schedules → Supabase contracts

| Field | Value |
|---|---|
| Rule Name | `Sync Lakecity Schedule to Supabase` |
| Model | `Lakecity Collection Schedule` (`lakecity.collection.schedule`) |
| Trigger | `On Creation` |
| Apply on | `[]` |

**Action**: Same shape as Rule 1, but the payload changes:

```python
for record in records:
    payload = {
        '_model': 'lakecity.collection.schedule',
        '_id': record.id,
        'stand_number': record.stand_number,
        'partner_id': [record.partner_id.id, record.partner_id.name] if record.partner_id else False,
        'sale_price': float(record.sale_price or 0.0),
        'payment_amount': float(record.payment_amount or 0.0),
        'term_months': record.term_months,
        'start_date': record.start_date.isoformat() if record.start_date else False,
        'customer_category': record.customer_category,
    }
    # ...same urllib.request.Request POST as Rule 1
```

## Configure the System Parameters in Odoo

The Python actions above read two `ir.config_parameter` rows. Set them once:

In Odoo: **Settings → Technical → System Parameters → Create**.

| Key | Value |
|---|---|
| `lakecity_crm.webhook_url` | `https://<your-lovable-project>.supabase.co/functions/v1/odoo-webhook` |
| `lakecity_crm.webhook_bearer` | The hex token created in Step 4 (`odoo_webhook_secret_<uuid>`) |

Tip: store the bearer in Odoo only as the System Parameter; never paste it into a server action's source.

## Smoke test in staging

1. In staging Odoo, open one of the imported schedules (e.g. `TEST-001`).
2. Click into the first unpaid payment line.
3. Set `amount_paid = 100` → save.
4. Within ~5 seconds, in the staging Lovable Cloud SQL editor:
   ```sql
   select id, stand_number, amount, qc_status, odoo_collection_payment_id, created_at
   from payment_receipts
   where stand_number = 'TEST-001'
   order by created_at desc
   limit 5;
   ```
   Expected: a new row with `qc_status='approved'`, `amount=100`, `odoo_collection_payment_id` populated.
5. Open the staging customer portal as the test customer for `TEST-001` → confirm the payment appears in the dashboard.
6. Now go back to Odoo and clear `amount_paid` to 0 → save.
7. Re-run the SQL above → the receipt row should be gone (the unpaid branch deletes it).

## Sign-off

- [ ] Migration applied in staging; columns and unique index exist.
- [ ] `odoo-webhook` deployed with the new branches.
- [ ] Both Odoo automation rules saved and active.
- [ ] System Parameters `lakecity_crm.webhook_url` and `webhook_bearer` set.
- [ ] Staging smoke test passed (paid → receipt appears, unpaid → receipt removed).
- [ ] Customer-portal smoke test confirmed the payment shows up live.

Proceed to [07-cutover-functions.md](07-cutover-functions.md).
