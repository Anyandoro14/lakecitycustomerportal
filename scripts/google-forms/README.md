# Google Forms → Make → Odoo (receipt intake)

## 1. Apps Script

Copy [`LakecityReceiptIntake.gs`](./LakecityReceiptIntake.gs) into **Extensions → Apps Script** on the spreadsheet that receives your Form responses.

### Behaviour

- Reads the **submitted row** from tab **`SHEET_NAME`** (default `Form Responses 1`), same as your legacy **RECEIPT_CAPTURE → Make** script.
- Builds a full **`answers`** map from header row + values (good for debugging and Odoo fallbacks).
- Adds **`pick_()` aliases** for stand, receipt link, amount, payer — edit the arrays in **`onFormSubmit`** if your column titles differ.
- Always sends a fresh **`uuid`** (required for Odoo intake idempotency).
- Top-level fields **`stand_number`**, **`receipt_link`**, **`amount`**, **`payer_name`** help Make map fewer nested paths.

### Webhook URL

Either set **`WEBHOOK_URL`** at the top of the `.gs` file **or** leave it empty and set Script property **`MAKE_WEBHOOK_URL`**.

### Script properties (Project Settings → Script properties)

| Property | When | Value |
|----------|------|--------|
| `SUBMIT_TARGET` | Optional | `make` (default) or `odoo` |
| `MAKE_WEBHOOK_URL` | `SUBMIT_TARGET=make` and empty `WEBHOOK_URL` | Your Make **Custom webhook** URL |
| `LAKECITY_ODOO_ORIGIN` | `SUBMIT_TARGET=odoo` | e.g. `https://lakecity-standledger.odoo.com` |
| `LAKECITY_API_TOKEN` | `SUBMIT_TARGET=odoo` | Odoo **Settings → Technical → Parameters → `lakecity_loan.api_token`** |

### Trigger

**Triggers → Add trigger**

- Function: `onFormSubmit`
- Event source: **From spreadsheet**
- Event type: **On form submit**

Run **`authorizeOnce`** once from the editor if UrlFetch needs authorization.

---

## 2. Make.com scenario (`SUBMIT_TARGET=make`)

1. **Webhooks — Custom webhook** (module 1). Same URL as **`WEBHOOK_URL`** / **`MAKE_WEBHOOK_URL`**.
2. **HTTP — Make a request**
   - Method: `POST`
   - URL: `{ODOO_ORIGIN}/lakecity/api/v1/receipt/intake`
   - Headers: `Authorization: Bearer {token}`, `Content-Type: application/json`
   - Body: map webhook bundle — see [`make-odoo-http-body.example.json`](./make-odoo-http-body.example.json). In Make’s UI you usually map each field separately; if `answers` must stay an object, use Make’s panel to insert the **`answers`** collection rather than a string placeholder.
3. **Gmail — Send an email** — map from bundle 1.
4. **Twilio — Create a message** — map from bundle 1.

Keep the Odoo Bearer token **only** in Make’s HTTP step.

---

## 3. Optional: unlink Sheet storage

If you unlink the Form from the spreadsheet, this row-based script will not run unless you adapt it to Form-bound triggers and `e.response.getItemResponses()`.
