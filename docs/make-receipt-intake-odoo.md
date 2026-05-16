# LakeCity receipts: Make.com → Odoo (QC in Odoo)

Receipt submissions should land in **Odoo** as **`lakecity.receipt.intake`** (`pending_qc`), not only in Google Sheets. Human **QC** happens in Odoo; approved rows become **`lakecity.loan.payment`** (same allocation engine as BNPL payments).

---

## Keeping Gmail + Twilio SMS **and** Odoo (recommended)

Use **one** Google Apps Script `POST` to your **Make Custom webhook**. Make then fans out to **Odoo**, **Gmail**, and **Twilio** — same pattern as your old scenario, without needing Sheets as the source of truth.

1. **Apps Script** — store only the webhook URL (no Odoo token in Google):

   | Script property | Value |
   |-----------------|--------|
   | `MAKE_WEBHOOK_URL` | `https://hook.us2.make.com/bhoso4zsfmneuo8dojja63igi6arxrxs` |

   On submit, `POST` JSON: `{ "uuid": "...", "timestamp": "...", "answers": { ... } }` (same shape as below). **Content-Type: `application/json`.**

2. **Make scenario** (order can be linear or parallel depending what you prefer):

   - **Webhooks — Custom webhook** (module 1)
   - **HTTP — Make a request** → `POST https://<your-odoo-host>/lakecity/api/v1/receipt/intake`  
     Headers: `Authorization: Bearer <lakecity_loan.api_token>`, `Content-Type: application/json`  
     Body: map from webhook bundle (`uuid`, `timestamp`, `answers`, …) into the JSON Odoo expects (see below).
   - **Gmail — Send an email** — map subject/body from webhook fields (and optionally from HTTP step `intake_id`).
   - **Twilio — Create a message** — map SMS body from the same fields.

Put the **Odoo Bearer token only in Make** (HTTP module connection / headers), not in Apps Script.

If you want SMS/email **even when Odoo returns an error**, split branches after the webhook (e.g. router / parallel paths) so notifications are not strictly tied to HTTP success — your choice.

### Implemented in this repository

| Artifact | Purpose |
|----------|---------|
| [`scripts/google-forms/LakecityReceiptIntake.gs`](../scripts/google-forms/LakecityReceiptIntake.gs) | Copy into Google Apps Script; `SUBMIT_TARGET=make` posts to Make (recommended). |
| [`scripts/google-forms/README.md`](../scripts/google-forms/README.md) | Step-by-step wiring for Script properties, triggers, and Make modules. |
| [`scripts/google-forms/make-odoo-http-body.example.json`](../scripts/google-forms/make-odoo-http-body.example.json) | Example JSON body for Make’s HTTP → Odoo step (adjust field expressions in Make UI). |
| [`scripts/test-make-receipt-webhook.mjs`](../scripts/test-make-receipt-webhook.mjs) | Local smoke test: `MAKE_WEBHOOK_URL=… node scripts/test-make-receipt-webhook.mjs` |

---

## Google Form → Odoo directly (no Google Sheets, no Make)

Use this only if you **do not** need Make for mail/SMS.

### A. Form linked to a spreadsheet (simplest trigger setup)

The sheet can stay empty/archival-only; Odoo remains the system of record.

1. Open the **response spreadsheet** for your Form → **Extensions → Apps Script**.
2. **Project settings → Script properties** — add the keys for the option you use:

   | If you use… | Script properties |
   |---------------|-------------------|
   | **Option A — POST to Make** (email/SMS in Make) | `MAKE_WEBHOOK_URL` = your Custom webhook URL |
   | **Option B — POST to Odoo only** | `LAKECITY_ODOO_ORIGIN` (no trailing slash) and `LAKECITY_API_TOKEN` (= Odoo `lakecity_loan.api_token`) |

3. Paste **one** of the options below and adjust question titles to match your form **exactly**.

**Option A — POST to Make** (Odoo + Gmail + Twilio handled in Make; only `MAKE_WEBHOOK_URL` in Script properties):

```javascript
function onFormSubmit(e) {
  var hook = PropertiesService.getScriptProperties().getProperty('MAKE_WEBHOOK_URL');
  if (!hook) throw new Error('Missing MAKE_WEBHOOK_URL');

  var nv = e.namedValues;
  function cell(title) {
    var v = nv[title];
    return v && v.length ? String(v[0]).trim() : '';
  }

  var payload = {
    uuid: Utilities.getUuid(),
    timestamp: new Date().toISOString(),
    answers: {
      'Stand Number': cell('Stand Number'),
      'First Name': cell('First Name'),
      'Last Name': cell('Last Name'),
      'Receipt Date': cell('Receipt Date'),
      Amount: cell('Amount'),
      'Payment Method': cell('Payment Method'),
      Receipt: cell('Receipt'),
      'Receipt Entered by': cell('Receipt Entered by'),
    },
  };

  var res = UrlFetchApp.fetch(hook, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() >= 400) {
    throw new Error('Make webhook ' + res.getResponseCode() + ': ' + res.getContentText());
  }
}
```

**Option B — POST straight to Odoo** (no Make; no built-in Gmail/Twilio unless you add them in script — use `LAKECITY_ODOO_ORIGIN` + `LAKECITY_API_TOKEN`):

```javascript
function onFormSubmit(e) {
  var props = PropertiesService.getScriptProperties();
  var origin = props.getProperty('LAKECITY_ODOO_ORIGIN');
  var token = props.getProperty('LAKECITY_API_TOKEN');
  if (!origin || !token) throw new Error('Missing LAKECITY_ODOO_ORIGIN or LAKECITY_API_TOKEN');

  var nv = e.namedValues;
  function cell(title) {
    var v = nv[title];
    return v && v.length ? String(v[0]).trim() : '';
  }

  var payload = {
    uuid: Utilities.getUuid(),
    timestamp: new Date().toISOString(),
    answers: {
      'Stand Number': cell('Stand Number'),
      'First Name': cell('First Name'),
      'Last Name': cell('Last Name'),
      'Receipt Date': cell('Receipt Date'),
      Amount: cell('Amount'),
      'Payment Method': cell('Payment Method'),
      Receipt: cell('Receipt'),
      'Receipt Entered by': cell('Receipt Entered by'),
    },
  };

  var url = origin + '/lakecity/api/v1/receipt/intake';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() >= 400) {
    throw new Error('Odoo ' + res.getResponseCode() + ': ' + res.getContentText());
  }
}
```

4. **Triggers → Add trigger**: function **`onFormSubmit`**, event source **From spreadsheet**, type **On form submit**.
5. In Google Forms → **Responses**, you can turn **off** “Collect email addresses” etc. as needed; to **stop writing rows** to the linked sheet entirely you’d unlink the sheet from the Form (then use option **B** below for triggering).

### B. Form not linked to a spreadsheet

Use an Apps Script **attached to the Form** with an **On form submit** trigger (create the script from the Form’s Apps Script integration if available). Build `answers` by iterating `e.response.getItemResponses()` and mapping each item’s title → response, then POST the same JSON shape as above to `/lakecity/api/v1/receipt/intake`.

### Receipt uploads

The **Receipt** answer must resolve to an **`https://`** URL or Odoo returns `https_receipt_url_required`. Google Forms file uploads usually give a Drive URL — ensure it’s shared **Anyone with the link** if Odoo needs to download it server-side during QC approval.

---

## Lake City Make.com webhook (reference URL)

Configure Google Forms (or any sender) to **POST to Make first** using this Custom webhook URL:

```text
https://hook.us2.make.com/bhoso4zsfmneuo8dojja63igi6arxrxs
```

Inside Make, follow this URL with **HTTP → Odoo** as documented below. *(If this repo is public, treat the hook like a capability URL — rotate it in Make if it leaks.)*

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
| Customer name | `customer_name`, `payer_name`, **or** `First Name` + `Last Name` in `answers` |
| Receipt date | `payment_date`, `Payment_Date`, `Receipt Date` |
| Amount | `amount`, `Payment_Amount`, `Amount` |
| Payment method | `payment_method`, `Payment_Method`, `Payment Method` (maps to BNPL source: Transfer→Bank Transfer, Cash, EcoCash, Kuva, …) |
| Reference | `reference`, `Reference` |
| Receipt file URL | `receipt_url`, `receipt_link`, `Receipt_URL`, **`Receipt`**, `Receipt Link`, `Link to receipt` — **must be `https://`** |
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

Your **Make webhook URL** (`https://hook.us2.make.com/bhoso4zsfmneuo8dojja63igi6arxrxs`) is what the form posts to; the **Odoo URL** is the target of the **HTTP** module that runs **after** the webhook inside Make.
