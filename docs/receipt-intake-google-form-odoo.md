# LakeCity receipts: Google Form → Odoo (Make-free)

Receipt submissions land in **Odoo** as **`lakecity.receipt.intake`** (`pending_qc`). Human **QC** stays in Odoo; approved rows become **`lakecity.loan.payment`**.

**Make.com is no longer required** for the happy path. Notifications (email + SMS) run from **Apps Script** and optionally again from **Odoo** (source of truth for “new intake arrived”).

---

## Architecture (current)

```text
Accounting admin
    → Google Form
    → Spreadsheet-bound Apps Script (LakecityReceiptIntake.gs)
    → POST /lakecity/api/v1/receipt/intake  (Bearer lakecity_loan.api_token)
    → lakecity.receipt.intake (pending_qc)
    → Ops email + SMS (Apps Script; Odoo also notifies on create)
    → Human QC in Odoo → Approve → lakecity.loan.payment
```

| Before (deprecated) | After (primary) |
|---------------------|-----------------|
| Form → Apps Script → **Make webhook** → Odoo HTTP + Gmail + Twilio | Form → Apps Script → **Odoo HTTP** + GmailApp/MailApp + Twilio REST |
| Notifications only in Make | Notifications in Apps Script **and** Odoo (`message_post` + optional mail/SMS) |

---

## Implemented in this repository

| Artifact | Purpose |
|----------|---------|
| [`scripts/google-forms/LakecityReceiptIntake.gs`](../scripts/google-forms/LakecityReceiptIntake.gs) | Default `SUBMIT_TARGET=odoo`; Drive https helper; email + Twilio; failure notify + throw |
| [`scripts/google-forms/README.md`](../scripts/google-forms/README.md) | Script properties, trigger, cutover checklist |
| [`scripts/test-odoo-receipt-intake.mjs`](../scripts/test-odoo-receipt-intake.mjs) | Smoke POST to Odoo intake |
| [`scripts/test-make-receipt-webhook.mjs`](../scripts/test-make-receipt-webhook.mjs) | Legacy Make smoke (deprecated) |
| `odoo/addons/lakecity_loan_management` (≥ 19.0.1.0.69) | Intake API, create-time notify, contract soft-check, attachment-failure activity |

Full setup steps: **[`scripts/google-forms/README.md`](../scripts/google-forms/README.md)**.

---

## Endpoint

```text
POST https://<your-odoo-host>/lakecity/api/v1/receipt/intake
Authorization: Bearer <lakecity_loan.api_token>
Content-Type: application/json
```

### JSON body

Odoo accepts **flat** keys and/or Google-Forms-style **`answers`**.

| Concept | Accepted keys (first match wins) |
|--------|-----------------------------------|
| Intake ID | `uuid`, `intake_uuid`, `Intake_ID` |
| Timestamp | `timestamp`, `Timestamp` |
| Stand | `stand_number`, `Stand_Number`, `Stand Number` |
| Customer name | `customer_name`, `payer_name`, or `First Name` + `Last Name` in `answers` |
| Receipt date | `payment_date`, `Payment_Date`, `Receipt Date` |
| Amount | `amount`, `Payment_Amount`, `Amount` (> 0) |
| Payment method | `payment_method`, `Payment_Method`, `Payment Method` |
| Reference | `reference`, `Reference` |
| Receipt file URL | `receipt_url`, `receipt_link`, `Receipt`, … — **must be `https://`** |
| Entered by | `entered_by`, `Entered_By`, `Receipt Entered by` |

### Success / errors

- **200** `{ "ok": true, "intake_id": ..., "state": "pending_qc", "contract_found": bool, "warnings": [...] }`
- **400** `uuid_required` / `stand_number_required` / `positive_amount_required` / `https_receipt_url_required` (each includes a `message`)
- **409** `intake_already_processed` if the same `uuid` was already QC’d

Missing loan contract for the stand is a **warning**, not a hard reject — intake still lands in `pending_qc`.

### Example payload

```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-21T12:00:00.000Z",
  "stand_number": "A12",
  "payer_name": "Jane Doe",
  "payment_date": "2026-03-20",
  "amount": "1500.00",
  "payment_method": "Bank Transfer",
  "receipt_url": "https://drive.google.com/uc?export=download&id=FILE_ID",
  "entered_by": "accounting.admin@example.com",
  "answers": {
    "Stand Number": "A12",
    "Amount": "1500.00",
    "Receipt": "https://drive.google.com/uc?export=download&id=FILE_ID"
  }
}
```

### Smoke test

```bash
ODOO_ORIGIN=https://<your-odoo-host> \
LAKECITY_API_TOKEN=<token> \
node scripts/test-odoo-receipt-intake.mjs
```

---

## Notifications (product choice)

**Prefer notify-on-failure too.** Apps Script always emails/SMS ops after a failed Odoo HTTP call (unless `NOTIFY_ON_ODOO_FAILURE=never`), then **throws** so the execution is red and Form/trigger retries remain visible.

Odoo also notifies on successful create of a `pending_qc` row (chatter + optional mail/SMS from system params). Configure both for redundancy during cutover; you can later rely primarily on Odoo.

| Layer | Email | SMS |
|-------|-------|-----|
| Apps Script | `NOTIFY_EMAILS` + MailApp/GmailApp | Twilio Script properties |
| Odoo | `lakecity_loan.notify_emails` | `lakecity_loan.notify_sms_to` + Twilio system params |

---

## QC (unchanged)

1. **Lakecity Loans → Receipt intakes (QC)** (defaults to pending).
2. **Approve & post to BNPL** (managers) or **Reject** (reason required).
3. On approval: creates/updates `lakecity.loan.payment` with `external_uid = uuid`, attaches receipt from HTTPS URL when downloadable; if download fails, schedules a **todo activity**.

**Prerequisite:** a `lakecity.loan.contract` for that stand before approve.

---

## Make.com — deprecated

Make was previously: Custom webhook → HTTP Odoo → Gmail → Twilio.

- **Do not** use the public Make hook as the recommended path.
- Rollback only: set Apps Script `SUBMIT_TARGET=make` and `MAKE_WEBHOOK_URL`, re-enable the scenario briefly.
- After cutover: **pause/disable** the Make scenario.

Legacy example body for Make’s HTTP module (rollback): [`scripts/google-forms/make-odoo-http-body.example.json`](../scripts/google-forms/make-odoo-http-body.example.json).

---

## Cutover checklist

See **[`scripts/google-forms/README.md`](../scripts/google-forms/README.md)** §3 — flip `SUBMIT_TARGET`, one test form, verify Odoo + notify, disable Make.
