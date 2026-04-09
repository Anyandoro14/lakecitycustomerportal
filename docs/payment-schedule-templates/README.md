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

From the repository root (creates `docs/payment-schedule-templates/.venv-xlsx` on first run and installs `openpyxl`):

```bash
bash docs/payment-schedule-templates/run-fix-templates.sh
```

Manual alternative: `python3 -m venv docs/payment-schedule-templates/.venv-xlsx`, then install `requirements-xlsx.txt` and run `fix_collection_schedule_templates.py` with that interpreter.

## Portal / Edge Functions note

Edge Functions resolve the correct tab using **`profiles.payment_plan_months`** and the canonical name **`Collection Schedule - N Months`**. Pick the template whose term **N** matches that profile value. Variable-width templates use header-based totals where supported.

## Tab naming in the master workbook

Use **`Collection Schedule - N Months`** (e.g. **`Collection Schedule - 36 Months`**). Legacy **`Collection Schedule 1`** is still recognized as the 36‑month tab until you rename it.
