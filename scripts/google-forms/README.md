# Google Forms → Odoo (receipt intake)

Primary path: **Google Form → Apps Script → Odoo** (`pending_qc`). Make.com is **deprecated** (rollback only).

## 1. Apps Script

Copy [`LakecityReceiptIntake.gs`](./LakecityReceiptIntake.gs) into **Extensions → Apps Script** on the spreadsheet that receives your Form responses (replace the old script).

### Behaviour

- Default **`SUBMIT_TARGET=odoo`**: `POST` JSON to `{LAKECITY_ODOO_ORIGIN}/lakecity/api/v1/receipt/intake` with Bearer token.
- Builds a full **`answers`** map from header row + values; top-level fields help Odoo flatten.
- Always sends a fresh **`uuid`** (Odoo intake idempotency).
- **Drive receipt URLs**: `ensureShareableReceiptUrl_` sets Anyone-with-link and rewrites to an `https://` download URL (Odoo requires https).
- After Odoo success **or** hard failure: **email** (`NOTIFY_EMAILS`) + **SMS** (Twilio props). Failure still **throws** so Apps Script executions show the error / Form can retry.
- Legacy **`SUBMIT_TARGET=make`**: posts to Make only; keep for rollback, then disable the Make scenario.

### Script properties (Project Settings → Script properties)

| Property | Required | Value |
|----------|----------|--------|
| `SUBMIT_TARGET` | No (default `odoo`) | `odoo` (primary) or `make` (deprecated) |
| `LAKECITY_ODOO_ORIGIN` | Yes for `odoo` | e.g. `https://lakecity-standledger.odoo.com` (no trailing slash) |
| `LAKECITY_API_TOKEN` | Yes for `odoo` | Odoo **Settings → Technical → Parameters → `lakecity_loan.api_token`** |
| `NOTIFY_EMAILS` | Recommended | Comma-separated ops emails |
| `TWILIO_ACCOUNT_SID` | For SMS | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | For SMS | Twilio auth token |
| `TWILIO_FROM` | For SMS | E.164 Twilio number |
| `NOTIFY_SMS_TO` | For SMS | E.164 recipient(s), comma-separated |
| `NOTIFY_ON_ODOO_FAILURE` | No | `always` (default) or `never` |
| `MAKE_WEBHOOK_URL` | Only if `make` | Legacy Custom webhook URL |
| `DRY_RUN_POST` | Optional | Set `1` so `testReceiptIntakePayload` also POSTs to Odoo |

Do **not** commit secrets into the `.gs` file — use Script properties only.

### Trigger

**Triggers → Add trigger**

- Function: `onFormSubmit`
- Event source: **From spreadsheet**
- Event type: **On form submit**

Run **`authorizeOnce`** once from the editor (grants UrlFetch + Mail + Drive).

### Smoke test from the editor

1. Set Script properties for Odoo + notifications.
2. Run **`testReceiptIntakePayload`** — logs the JSON payload.
3. Optionally set `DRY_RUN_POST=1` and run again to POST a `TEST-99` row to Odoo (expect `contract_not_found` warning if that stand has no loan).

---

## 2. Odoo (system of record for “new intake” alerts)

On create of `lakecity.receipt.intake` in `pending_qc`, Odoo:

- Soft-checks that a **loan contract** exists for the stand (warning + chatter note; intake still saved).
- **`message_post`** on the intake chatter.
- Optional **email** / **Twilio SMS** from system parameters (so alerts are not solely on Apps Script).

| System parameter | Purpose |
|------------------|---------|
| `lakecity_loan.api_token` | Bearer token for the HTTP API |
| `lakecity_loan.notify_emails` | Comma-separated ops emails |
| `lakecity_loan.notify_sms_to` | Comma-separated E.164 numbers |
| `lakecity_loan.twilio_account_sid` | Twilio SID |
| `lakecity_loan.twilio_auth_token` | Twilio token |
| `lakecity_loan.twilio_from` | Twilio From number |

QC is unchanged: **Lakecity Loans → Receipt intakes (QC) → Approve & post to BNPL**.

---

## 3. Cutover checklist (~15 minutes)

1. Upgrade / deploy `lakecity_loan_management` **19.0.1.0.69+** on Odoo.sh.
2. Confirm `lakecity_loan.api_token` and optional notify/Twilio params in Odoo.
3. Paste updated [`LakecityReceiptIntake.gs`](./LakecityReceiptIntake.gs); set Script properties (`SUBMIT_TARGET=odoo`, origin, token, notify).
4. Re-bind trigger `onFormSubmit` → **On form submit**; run **`authorizeOnce`**.
5. Submit **one test form** (or run `testReceiptIntakePayload` with `DRY_RUN_POST=1`).
6. In Odoo: confirm a new `pending_qc` intake; confirm email/SMS (Apps Script and/or Odoo).
7. **Disable / pause the Make.com scenario** (do not delete until a few live days are clean). Unset `MAKE_WEBHOOK_URL` if unused.
8. Rollback if needed: set `SUBMIT_TARGET=make` + `MAKE_WEBHOOK_URL`, re-enable Make briefly.

---

## 4. Local smoke test (Odoo HTTP)

```bash
ODOO_ORIGIN=https://your-odoo-host \
LAKECITY_API_TOKEN=your-token \
node scripts/test-odoo-receipt-intake.mjs
```

Legacy Make webhook smoke test remains at `scripts/test-make-receipt-webhook.mjs` (deprecated).

---

## 5. Optional: unlink Sheet storage

If you unlink the Form from the spreadsheet, this row-based script will not run unless you adapt it to Form-bound triggers and `e.response.getItemResponses()`.
