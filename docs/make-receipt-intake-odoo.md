# LakeCity receipts: Make.com → Odoo (QC in Odoo)

This replaces posting receipt rows only to Google Sheets **Collection schedule / Receipts_Intake** with posting into **Odoo** as BNPL-ready intake records. Human **QC** happens in Odoo; approved rows become **`lakecity.loan.payment`** (same engine as Collection Schedule allocations).

## Endpoint (“webhook URL” for Make HTTP module)

Use your production host (Odoo.sh example):

```text
POST https://<your-database>.odoo.sh/lakecity/api/v1/receipt/intake
```

Headers:

```text
Authorization: Bearer <lakecity_loan.api_token>
Content-Type: application/json
```

Set `lakecity_loan.api_token` in Odoo under **Settings → Technical → Parameters → System Parameters** (same secret used by other Lakecity loan APIs).

## JSON body (same fields as your sheet / webhook)

Odoo accepts either **flat** keys or a Google-Forms-style **`answers`** object (keys like `"Stand Number"`, `"Amount"`, …).

| Concept | Accepted keys (first match wins) |
|--------|-----------------------------------|
| Intake ID | `uuid`, `intake_uuid`, `Intake_ID` |
| Timestamp | `timestamp`, `Timestamp` |
| Stand | `stand_number`, `Stand_Number`, `Stand Number` |
| Customer name | `customer_name`, … **or** `First Name` + `Last Name` in `answers` |
| Receipt date | `payment_date`, `Payment_Date`, `Receipt Date` |
| Amount | `amount`, `Payment_Amount`, `Amount` |
| Payment method | `payment_method`, `Payment_Method`, `Payment Method` (maps to BNPL source: Transfer→Bank Transfer, Cash, EcoCash, Kuva, …) |
| Reference | `reference`, `Reference` |
| Receipt file URL | `receipt_url`, `Receipt_URL`, **`Receipt`** — **must be `https://`** |
| Entered by | `entered_by`, `Entered_By`, `Receipt Entered by` |

### Example payload (explicit mapping from Make)

```json
{
  "uuid": "{{webhook.uuid}}",
  "timestamp": "{{webhook.timestamp}}",
  "stand_number": "{{webhook.answers.`Stand Number`}}",
  "customer_name": "{{webhook.answers.`First Name`}} {{webhook.answers.`Last Name`}}",
  "payment_date": "{{webhook.answers.`Receipt Date`}}",
  "amount": "{{webhook.answers.`Amount`}}",
  "payment_method": "{{webhook.answers.`Payment Method`}}",
  "receipt_url": "{{webhook.answers.`Receipt`}}",
  "entered_by": "{{webhook.answers.`Receipt Entered by`}}",
  "reference": ""
}
```

(Adjust Make’s expression syntax; the important part is the **field names** and **HTTPS receipt URL**.)

### Success / errors

- **200** `{ "ok": true, "intake_id": ..., "state": "pending_qc", ... }`
- **409** if the same `uuid` is sent again after QC has completed (`intake_already_processed`).

## QC step (replaces Sheets `PENDING_QC` + search)

1. Make still receives the Google Form / webhook first (your **Custom webhook** URL stays on Make — that is **not** the Odoo URL).
2. After **HTTP → Odoo**, the row is **`pending_qc`** in Odoo.
3. In Odoo: **Lakecity Loans → Receipt intakes (QC)** (defaults to pending).
4. Open a line → **Approve & post to BNPL** (managers only) **or** **Reject** (rejection reason required).
5. On approval, Odoo creates/updates **`lakecity.loan.payment`** with `external_uid = uuid`, attaches the receipt file from the URL (HTTPS), and rebuilds allocations on the loan for that **stand**.

**Prerequisite:** a **`lakecity.loan.contract`** must already exist for that stand (same as your Collection Schedule keying).

## Optional Make layout

Suggested flow:

1. **Webhooks — Custom webhook** (unchanged trigger).
2. **Router** (QC at automation level): drop rows without `uuid`, stand, positive amount, or `https` receipt URL.
3. **HTTP — Make a request** → Odoo URL above (JSON body).
4. **Gmail / Twilio / Data store** as you prefer (keep or remove Google Sheets — you can keep Sheets as a read-only audit log if desired).

Your **Make webhook URL** (`https://hook.us2.make.com/...`) is still what the form posts to; the **Odoo URL** is the target of the **HTTP** module that runs **after** the webhook inside Make.
