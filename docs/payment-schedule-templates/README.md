# Payment schedule templates (BNPL ledger)

Excel workbooks for the **Collection Schedule** tabs in Google Sheets. They implement a **BNPL-style loan ledger**: **Total price** is the base contract amount; **deposit** is deducted before instalments; **due dates** align to the **5th** of each month; all templates share a **168-column monthly grid** (Columns **M** through **FX**, January 2022 – December 2035) supporting terms **12–120 months**.

**Canonical spec:** see **[BNPL_SCHEDULE_SPEC.md](./BNPL_SCHEDULE_SPEC.md)** (formulas, Column **I** / **H**, widening rules).

**Operator instructions:** see **[COLLECTION_SCHEDULE_TEMPLATE_INSTRUCTIONS.md](./COLLECTION_SCHEDULE_TEMPLATE_INSTRUCTIONS.md)** — the single reference for template setup. Instructions are **not** embedded as a separate tab inside the `.xlsx` files.

## Column layout (data sheet)

| Area | Role |
|------|------|
| A–L | Identity, **Deposit** (typ. **H**), **Total price** base (**I**), **Term / # instalments** (**J**), **Payment / monthly instalment** (typ. **K**), **Payment start date** (**L**, any qualifying 5th) |
| **M–FX** | **168** monthly instalment columns (5 Jan 2022 – 5 Dec 2035) |
| **FY** | **Next Payment** marker column |
| **FZ** | **TOTAL PAID** |
| After FZ | **Current Balance**, **Payment Progress**, then Receipts … Registered (operational) |

**Formulas (per row):** after running the fix script, **TOTAL PAID** = `Deposit + SUM(M:FX)` (monthly amounts only); **Current Balance** = `Total price − Deposit − SUM(M:FX)`; **Progress** = `(Deposit + SUM(M:FX)) / Total price`. Backend code **clamps** reads to the column before **Next Payment** so long `payment_plan_months` values do not overrun the physical grid. See the spec file for exact Excel.

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

Each file has **one** data sheet: **`Collection Schedule - {N}mo`**. Operator setup instructions are in **[COLLECTION_SCHEDULE_TEMPLATE_INSTRUCTIONS.md](./COLLECTION_SCHEDULE_TEMPLATE_INSTRUCTIONS.md)**.

## Regenerating formulas

From the repository root (creates `docs/payment-schedule-templates/.venv-xlsx` on first run):

```bash
bash docs/payment-schedule-templates/run-fix-templates.sh
```

Then replace or merge the output xlsx files into your master Google Sheet, or upload new workbooks built from these templates.

## Portal / Edge Functions

`fetch-google-sheets` reads **`profiles.payment_plan_months`** (default 36) to determine how many month columns (M onward) to include, and **clamps** reads to the column before **Next Payment** (FY). It finds **TOTAL PAID** (FZ) / **Current Balance** / **Payment Progress** by **header text** so the 168-column layout keeps working.

## Tab naming in the master workbook

Use **`Collection Schedule - Nmo`** (e.g. **`Collection Schedule - 36mo`**, **`Collection Schedule - 120mo`**). Legacy **`Collection Schedule - N Months`** and **`Collection Schedule 1`** are still recognized until tabs are renamed.
