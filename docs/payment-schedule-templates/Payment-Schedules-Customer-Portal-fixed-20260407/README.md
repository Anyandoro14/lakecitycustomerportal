# Payment schedule templates (Collection Schedule)

Excel workbooks for customer payment grids, aligned with the portal’s **Column A–L** layout (Stand Number through Start Date), **monthly amounts from Column M**, then **Next Payment Column**, **TOTAL PAID**, **Current Balance**, and **Payment Progress**, followed by operational columns (Receipts through Registered).

## What was corrected (2026-04-07)

1. **TOTAL PAID** had been defined as `SUM` from Column M through the **Next Payment Column**. That incorrectly included the non-amount “Next Payment Column”. It is now **`SUM` only across true monthly columns** (from M through the column immediately before Next Payment).
2. **Current Balance** and **Payment Progress** are rewritten so they always reference the **TOTAL PAID** column for that template (required after structural edits).
3. **`TEMPLATE_INSTRUCTIONS`** was updated so the formula description matches the fix (and per-template column letters).
4. **60-month** workbook was missing from the original zip; it is generated from the 72-month file by removing the last 12 monthly columns.

## Templates included

| File | Term (months) |
|------|-----------------|
| `Collection_Schedule_Template_12mo.xlsx` | 12 |
| `Collection_Schedule_Template_24mo.xlsx` | 24 |
| `Collection_Schedule_Template_36mo.xlsx` | 36 |
| `Collection_Schedule_Template_48mo.xlsx` | 48 |
| `Collection_Schedule_Template_60mo.xlsx` | 60 |
| `Collection_Schedule_Template_72mo.xlsx` | 72 |
| `Collection_Schedule_Template_84mo.xlsx` | 84 |
| `Collection_Schedule_Template_96mo.xlsx` | 96 |
| `Collection_Schedule_Template_120mo.xlsx` | 120 |

Each file has a **TEMPLATE_INSTRUCTIONS** sheet and a **Collection Schedule - {N}mo** data sheet.

## Regenerating fixes

Requires Python 3 and `openpyxl` (`pip install openpyxl` or use the project venv `.venv-xlsx`).

From the repository root:

```bash
python3 docs/payment-schedule-templates/fix_collection_schedule_templates.py
```

## Portal / Edge Functions note

The live **`fetch-google-sheets`** logic for **Richcraft / “Collection Schedule 1”** assumes a **fixed** width of monthly columns and fixed positions for totals (see `supabase/functions/fetch-google-sheets/index.ts`). These variable-length templates are correct for **Sheets and finance**, but **customer-facing totals may not align** with that code until Edge Functions resolve columns dynamically (e.g. from headers or **NUMBER OF INSTALLMENTS**). Keep **stand numbers unique** across all tabs if the backend searches a single sheet or combined export.

## Tab naming (customer groups)

When copying into the master Google Sheet, rename the tab per your docs: **`{{Customer Group name}} - YYYY-MM-DD`** with date ≥ `2022-01-01`, or use legacy **`Collection Schedule 1`** for Richcraft.
