# Payment schedule templates (BNPL ledger)

Excel workbooks for the **Collection Schedule** tabs in Google Sheets. They implement a **BNPL-style loan ledger**: **Total price** is the base contract amount; **deposit** is deducted before instalments; **due dates** align to the **5th** of each month; schedules are **wide enough** to support terms **12–120 months** and operational visibility through **December 2035** when you extend monthly headers.

**Canonical spec:** see **[BNPL_SCHEDULE_SPEC.md](./BNPL_SCHEDULE_SPEC.md)** (formulas, Column **I** / **H**, widening rules).

## Column layout (data sheet)

| Area | Role |
|------|------|
| A–L | Identity, **Deposit** (typ. **H**), **Total price** base (**I**), **Payment / monthly instalment** (typ. **K**), **Payment start date** (**L**, any qualifying 5th) |
| **M** → last month | One column per instalment month (headers through at least **Dec 2035** when you widen the book) |
| After last month | **Next payment** marker column, **TOTAL PAID**, **Current Balance**, **Payment Progress** |
| Further right | Receipts … Registered (operational) |

**Formulas (per row):** after running the fix script, **TOTAL PAID** = Deposit + SUM(monthly cells); **Current Balance** = Total price − Deposit − SUM(monthly cells); **Progress** = (Deposit + SUM(monthly)) / Total price. See the spec file for exact Excel.

## Templates included

| File | Term (months) |
|------|----------------|
| `Collection_Schedule_Template_12mo.xlsx` | 12 |
| `Collection_Schedule_Template_24mo.xlsx` | 24 |
| `Collection_Schedule_Template_36mo.xlsx` | 36 |
| `Collection_Schedule_Template_48mo.xlsx` | 48 |
| `Collection_Schedule_Template_60mo.xlsx` | 60 |
| `Collection_Schedule_Template_72mo.xlsx` | 72 |
| `Collection_Schedule_Template_84mo.xlsx` | 84 |
| `Collection_Schedule_Template_96mo.xlsx` | 96 |
| `Collection_Schedule_Template_120mo.xlsx` | 120 |

Each file has **TEMPLATE_INSTRUCTIONS** and a **Collection Schedule - {N}mo** data sheet.

## Regenerating formulas

From the repository root (creates `docs/payment-schedule-templates/.venv-xlsx` on first run):

```bash
bash docs/payment-schedule-templates/run-fix-templates.sh
```

## Internal tester row (row 2)

To (re)apply the shared **Internal Tester** sample row on every template (`{{########}}`, Alex Nyandoro, deposit $5,000, total $120,000, etc.):

```bash
docs/payment-schedule-templates/.venv-xlsx/bin/python docs/payment-schedule-templates/add_internal_tester_row.py
```

Then replace or merge the output xlsx files into your master Google Sheet, or upload new workbooks built from these templates.

## Portal / Edge Functions

`fetch-google-sheets` reads **`profiles.payment_plan_months`** (default 36) to know **how many** month columns (M onward) to include, and finds **TOTAL PAID** / **Current Balance** / **Payment Progress** by **header text** so widened layouts keep working.

## Tab naming in the master workbook

Use **`Collection Schedule - Nmo`** (e.g. **`Collection Schedule - 36mo`**). Legacy **`Collection Schedule - N Months`** and **`Collection Schedule 1`** are still recognized until tabs are renamed.
