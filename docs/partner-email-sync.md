# Partner email sync (Collection Schedule → Standledger)

Replace portal placeholder partner emails (`stand-{N}@lakecity.portal`) with real addresses from Collection Schedule.

**Always run against Staging first.** Production is only after Staging looks clean.

| Environment | `ODOO_ORIGIN` (no trailing slash) |
|---|---|
| **Staging (default target)** | `https://lakecity-standledger-staging-38585394.dev.odoo.com` |
| Production-looking | `https://lakecity-standledger.odoo.com` |

Requires addon **`lakecity_loan_management` ≥ 19.0.1.0.70** (endpoint + placeholder overwrite on upsert).

## Overwrite rules

On `loan/upsert` and on `POST /lakecity/api/v1/partner/email/sync`:

| Existing partner email | Incoming email | Result |
|---|---|---|
| blank | real | **write** |
| `*@lakecity.portal` or contains `placeholder` | real | **write** |
| same real address | same | skip (`write_same`) |
| different real address | real | **conflict** (no write) |
| any real | blank / placeholder | skip (never downgrade) |

## CSV format

Header required:

```text
stand_number,email,name,source_sheet
458,phillchigiya@gmail.com,Phillip Chigiya,Collection Schedule - 36mo
```

- **Required for sync:** `stand_number`, `email`
- **Optional:** `name`, `source_sheet` (logged locally only; not sent to the API)
- Invalid emails (no `@`, missing TLD) are skipped by the script

Expected file path for ops: `exports/stand_email_updates.csv` (gitignored; may contain PII).

Current Collection Schedule export (**180** stands):

| `source_sheet` | Count |
|---|---|
| Collection Schedule - 36mo | 87 |
| BDO Import | 54 |
| Collection Schedule - 48mo | 22 |
| Sales Master (gap fill) | 17 |

Prefer Collection Schedule over BDO when sources disagree. Known override:

- **Stand 1543** → `leeroymechshub@gmail.com` (prefer over BDO `leeroyleethawani@gmail.com`; script `EMAIL_OVERRIDES`)

## Staging runbook

### 1. Upgrade Staging Odoo

1. Ship this change to Standledger Staging (via `staging` / sync) and wait for Odoo.sh build.
2. Apps → upgrade **Lakecity BNPL Loan Management** to **19.0.1.0.70**.
3. Settings → Technical → System Parameters → confirm `lakecity_loan.api_token` is set.

### 2. Local env (Staging)

```bash
# .env (do not commit)
ODOO_ORIGIN=https://lakecity-standledger-staging-38585394.dev.odoo.com
LAKECITY_LOAN_API_TOKEN=<exact lakecity_loan.api_token from Staging>
```

Health check:

```bash
node --env-file=.env scripts/odoo-bnpl-health.mjs
# expect HTTP 200 {"ok":true,...}
```

### 3. Dry-run sync

```bash
# Parse only
node scripts/sync-partner-emails-from-csv.mjs path/to/stand_email_updates.csv --local-only

# Server evaluates overwrite rules; does not write
node --env-file=.env scripts/sync-partner-emails-from-csv.mjs path/to/stand_email_updates.csv --dry-run
```

Review console buckets: `updated`, `conflicts`, `missing_contract`, `skipped`.

### 4. Apply on Staging

```bash
node --env-file=.env scripts/sync-partner-emails-from-csv.mjs path/to/stand_email_updates.csv
```

Exit code `2` if any conflicts or missing contracts remain (eligible rows are still written).

### 5. Spot-check in Staging UI

Open a few contracts that previously had `stand-N@lakecity.portal` and confirm `partner_id.email` is the Collection Schedule address. Leave **conflicts** for manual review.

## Production (only after Staging)

Repeat with:

```bash
ODOO_ORIGIN=https://lakecity-standledger.odoo.com
```

Do **not** point `.env` at production while iterating on Staging.

## API

```http
POST /lakecity/api/v1/partner/email/sync
Authorization: Bearer <lakecity_loan.api_token>
Content-Type: application/json

{
  "updates": [{"stand_number": "1321", "email": "a@b.com"}],
  "dry_run": false
}
```

Response includes `updated`, `skipped`, `missing_contract`, `conflicts`, and `summary` counts.

## Self-test (no Odoo)

```bash
python3 scripts/selftest-partner-email-overwrite.py
```
