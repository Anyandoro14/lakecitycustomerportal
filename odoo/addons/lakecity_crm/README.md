# Lakecity CRM — Collection Schedule (Odoo 19 addon)

A clean, focused Odoo CRM module that contains **every field** from the legacy
Collection Schedule spreadsheet, so the existing operational workflow can be
operated entirely inside Odoo without changes.

## What it ships

| Model | Purpose |
|---|---|
| `lakecity.collection.schedule` | One record per Stand. CRM record with chatter & activities. |
| `lakecity.collection.payment` | One line per month (the cells `M..FX` on the spreadsheet). |
| `res.partner` *(extended)* | Smart button to view a partner's schedules. |

### Field map (spreadsheet → Odoo)

| Spreadsheet column | Odoo field |
|---|---|
| A — Stand Number | `stand_number` |
| B — First Name | `first_name` |
| C — Last Name | `last_name` |
| D — Contact Number | `contact_number` (related to `partner_id.phone`) |
| E — Email | `email` (related to `partner_id.email`) |
| F — Customer Category | `customer_category` (selection) |
| G — Documentation Fee | `documentation_fee` |
| H — Deposit | `deposit` |
| I — TOTAL PRICE | `total_price` |
| J — # of Installments | `number_of_installments` |
| K — PAYMENT | `payment_amount` *(computed: ROUND((total_price − deposit) / installments, 2))* |
| L — Start Date | `start_date` *(constrained to day = 5)* |
| M..FX — monthly cells | `payment_line_ids` (one2many to `lakecity.collection.payment`) |
| FY — Next Payment Column | `next_payment_date` *(computed)* |
| FZ — TOTAL PAID | `total_paid` *(computed: deposit + sum of monthly amounts)* |
| GA — Current Balance | `current_balance` *(computed: total_price − total_paid)* |
| GB — Payment Progress | `payment_progress` *(computed: total_paid / total_price)* |
| GC — Receipts | `receipts_notes` *(plus chatter attachments)* |
| GD — Present Y | `present_y` |
| GE — Offer Received | `offer_received` (+ `offer_received_date`) |
| GF — Initial Payment Completed | `initial_payment_completed` (+ `initial_payment_date`) |
| GG — Agreement Requested | `agreement_requested` (+ `agreement_requested_date`) |
| GH — Agreement signed by Warwickshire | `agreement_signed_by_warwickshire` (+ date) |
| GI — Agreement signed by client | `agreement_signed_by_client` (+ date) |
| GJ — Agreement Type (VAT) | `agreement_type` (selection: VAT / Non-VAT) |
| GK — Agreement of sale file | `agreement_of_sale_file` (binary) |
| GL — Registered | `registered` (+ `registered_date`) |

### Term lengths

`term_months` is a Selection covering 12, 24, 36, 48, 60, 72, 84, 96, 120 — one
model handles all the legacy template variants.

### Business rules preserved

- Recurring installment due date is the **5th of every month** (Python
  constraint on both the schedule's `start_date` and each payment line's
  `due_date`).
- `payment_amount = ROUND((total_price − deposit) / installments, 2)` — same
  formula as the spreadsheet `K2` cell.
- `total_paid`, `current_balance`, `payment_progress` exactly match the
  documented intent in the `TEMPLATE_INSTRUCTIONS` sheet.

## Install

### On a regular Odoo server

1. Drop the `lakecity_crm` folder into your Odoo `addons` path.
2. Install Python deps: `pip install -r odoo/addons/lakecity_crm/requirements.txt`
3. Restart Odoo with `--update=all` once, or update the apps list in the UI
   and install **Lakecity CRM — Collection Schedule**.

### On Odoo.sh (Odoo 19)

This addon is **built for Odoo.sh / Odoo 19 out of the box**:

* Per-module `requirements.txt` — Odoo.sh auto-installs `openpyxl` at build.
* Manifest version follows the required `19.0.x.y.z` convention.
* All view tags use `<list>` (Odoo 18+ rename of `<tree>`).
* Action `view_mode` strings use `list,...` (no `tree`).
* Form chatter uses the new `<chatter/>` element.
* Kanban uses the canonical Odoo 18+ `<t t-name="card">` template.
* `_compute_display_name` replaces deprecated `name_get`.
* No system-package dependencies (`wkhtmltopdf` for the PDF report is
  preinstalled on Odoo.sh).
* Dependencies kept light (`base`, `mail`, `contacts`) so the addon installs
  on stripped-down Odoo.sh projects without surprises.

See [`docs/ODOO_SH_DEPLOY.md`](../../../docs/ODOO_SH_DEPLOY.md) at the repo
root for the full runbook (repo layout options, per-tenant Vault secrets,
Supabase ↔ Odoo.sh wiring, gotchas).

### Demo data

Optionally enable demo data on a fresh database to load the sample Stand
`24000` (Alex Nyandoro, 24 mo, $24,000, $5,000 deposit) — same record
shipped in `Collection_Schedule_Template_24mo.xlsx`.

## Views

- **Kanban** grouped by stage (Lead → Offer → Deposit → Agreement → Signed → Registered).
- **List** with progress bars and outstanding-balance decoration.
- **Form** grouped exactly like the spreadsheet (Customer / Pricing / Progress / Operational / Receipts) with embedded monthly payment list.
- **Pivot** on `lakecity.collection.payment` (rows = stand, cols = month, values = amount) reproduces the spreadsheet feel.
- **Search filters** for term length, customer category, balance, agreement status, registration.

## Security

Two groups: `Lakecity CRM / User` (read+write+create) and `Lakecity CRM / Manager` (+ delete & configuration). Multi-company record rules included.
