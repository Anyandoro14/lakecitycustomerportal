# Collection Schedule — Template Setup Guide (Operator Playbook)

This document is the **single reference** for setting up and maintaining the Excel payment schedule templates used in the StandLedger Collection Schedule workbooks. Each `.xlsx` template file contains **one data sheet** named `Collection Schedule - {N}mo` (e.g. `Collection Schedule - 120mo`). There is no separate instructions tab inside the workbook files.

## Template inventory

| File | Term (months) |
|------|---------------|
| `Collection_Schedule_Template_12mo.xlsx` | 12 |
| `Collection_Schedule_Template_24mo.xlsx` | 24 |
| `Collection_Schedule_Template_36mo.xlsx` | 36 |
| `Collection_Schedule_Template_48mo.xlsx` | 48 |
| `Collection_Schedule_Template_60mo.xlsx` | 60 |
| `Collection_Schedule_Template_72mo.xlsx` | 72 |
| `Collection_Schedule_Template_84mo.xlsx` | 84 |
| `Collection_Schedule_Template_96mo.xlsx` | 96 |
| `Collection_Schedule_Template_120mo.xlsx` | 120 |

## Sheet naming convention

The **canonical** tab title is:

```
Collection Schedule - {N}mo
```

- `{N}` is the term in months as digits (12, 24, 36, …, 120).
- `mo` is **lowercase**, no space between the number and `mo`.
- One space on each side of the hyphen: `Collection Schedule - 36mo`.

**Correct:** `Collection Schedule - 36mo`, `Collection Schedule - 120mo`

**Wrong:** `CollectionSchedule-120mo`, `Collection Schedule - 120 MO`, `Collection Schedule - 120 mo`, `120mo Collection Schedule`

Legacy names (`Collection Schedule 1`, `Collection Schedule - N Months`) are still accepted by the backend until tabs are renamed.

## Monthly calendar grid

All templates share the **same** header row for monthly columns regardless of term length:

| Property | Value |
|----------|-------|
| First month column | **M** — `5 January 2022` |
| Last month column | **FX** — `5 December 2035` |
| Count | **168** calendar month columns (M through FX) |
| After FX | **FY** (Next Payment), **FZ** (TOTAL PAID), then Current Balance, Payment Progress, then operational columns |

The term length (Column J) determines how many of those 168 columns a given contract actually uses — it does **not** change the physical width of the grid.

## Key columns

| Column | Role |
|--------|------|
| A–G | Stand number, customer identity |
| **H** | **Deposit** (down payment, treated as Payment #1) |
| **I** | **Total price** (base contract amount) |
| **J** | **Number of instalments / contract term** (e.g. 48 for a 48-month plan) |
| **K** | **Monthly instalment** amount = `(I − H) / J` |
| **L** | **Payment start date** (any qualifying 5th within the grid) |
| **M–FX** | Monthly instalment cells (one per calendar month, Jan 2022 – Dec 2035) |
| **FY** | Next Payment marker |
| **FZ** | **TOTAL PAID** |
| After FZ | Current Balance, Payment Progress, then Receipts … Registered |

## Formulas (per data row `r`)

1. **TOTAL PAID** (FZ)
   `=H{r}+SUM(M{r}:FX{r})`
   Deposit plus all monthly instalment amounts.

2. **Current Balance**
   `=I{r}-H{r}-SUM(M{r}:FX{r})`
   Total price minus deposit minus sum of instalment payments.

3. **Payment Progress**
   `=IF(I{r}=0,"", (H{r}+SUM(M{r}:FX{r}))/I{r})`
   Format as percentage.

4. **Monthly instalment (Column K)**
   `=(I{r}-H{r})/J{r}`
   Or hard-code the term if Column J is not used on a per-row basis.

## Due dates

- All due dates fall on the **5th** of the month.
- Column L holds each contract's payment start date (any qualifying 5th).
- Monthly column headers are pre-set to the 5th of each month from January 2022 through December 2035.

## Uploading / replacing templates

1. Regenerate formulas (from repo root):
   ```bash
   bash docs/payment-schedule-templates/run-fix-templates.sh
   ```
2. Upload the resulting `.xlsx` files to Google Sheets or merge into the master workbook.
3. Verify the data sheet is named `Collection Schedule - {N}mo`.

## Backend behaviour

- `fetch-google-sheets` reads `profiles.payment_plan_months` (default 36) and **clamps** reads to the column before **Next Payment** so long term values do not overrun the physical grid.
- `TEMPLATE_INSTRUCTIONS` is treated as a non-data tab and skipped during tab resolution — it will not break anything if present, but **should not be relied upon**.

## Related documentation

- **BNPL ledger spec:** `docs/payment-schedule-templates/BNPL_SCHEDULE_SPEC.md`
- **Template folder README:** `docs/payment-schedule-templates/README.md`
- **Tab naming helpers:** `src/lib/collection-schedule.ts` and `supabase/functions/_shared/collection-schedule-sheets.ts`
