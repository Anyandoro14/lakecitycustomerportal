# BNPL ledger — Collection Schedule specification

This document defines how **payment schedule** workbooks must behave for the customer portal and finance ops. You can apply these rules when building or widening templates before uploading to Google Sheets.

## Product model

- **BNPL-style ledger:** Each row is one lending contract (one stand / customer). **Column I — Total price** is the **base contract price** (principal cap before financing mechanics).
- **Deposit (typically Column H)** is deducted **before** splitting the remainder into instalments.
- **Financed amount** = Total price − Deposit. That amount is repaid via the monthly columns (Column **M** onward), each instalment due on the **5th** of the month.
- **Before any instalment payments are recorded** in Columns M onward, **Current Balance** must show the **net financed balance**: **Total price − Deposit** (i.e. what remains to be paid through instalments, assuming deposit is already settled).

## Monthly calendar grid

All templates share the **same** physical column grid:

| Property | Value |
|----------|-------|
| First month column | **M** — `5 January 2022` |
| Last month column | **FX** — `5 December 2035` |
| Count | **168** calendar month columns (M through FX) |
| Next Payment marker | **FY** |
| TOTAL PAID | **FZ** |

Column **J** on each row holds the **contract term** (number of instalments, e.g. 48). The term determines how many of the 168 monthly columns are used — it does **not** change the physical grid width.

## Totals and formulas (per data row)

Let:

- `I` = Total price (base)
- `H` = Deposit (adjust column letter if your header says "Deposit" elsewhere; the fix script discovers by header name when possible)
- `M` … `FX` = monthly instalment **amounts actually paid** (empty until paid)

Recommended Excel formulas (row `r`):

1. **TOTAL PAID** (Column FZ)
   `=H{r}+SUM(M{r}:FX{r})`
   Deposit counts toward what has been paid against the contract.

2. **Current Balance**
   `=I{r}-H{r}-SUM(M{r}:FX{r})`
   Equivalent to **Total price − (Deposit + sum of instalment cells)**. When no instalments are paid yet, this equals **I − H**.

3. **Payment progress** (contract % cleared)
   `=IF(I{r}=0,"", (H{r}+SUM(M{r}:FX{r}))/I{r})`
   Format as percentage. Uses **Total price** in **I** as the denominator.

4. **Monthly instalment (Column K or labelled "Payment" / "Instalment")**
   For **equal** instalments over **N** months:
   `=(I{r}-H{r})/N`
   where **N** is the term for that tab (12, 24, …, 120). You may type **N** per template or reference Column **J** which holds the term.

## Term lengths

Supported terms (one tab per **N**): **12, 24, 36, 48, 60, 72, 84, 96, 120** months. Use the tab name pattern **`Collection Schedule - Nmo`** (e.g. **`Collection Schedule - 120mo`**).

## Dates: 5th of the month and coverage through December 2035

- **Due dates** are always the **5th** of the month (align **Payment start date** in Column **L** and each monthly column header to a **5th**).
- **Start dates are not fixed globally** — each contract can start on any allowed 5th; Column **L** holds that contract's start.
- The monthly grid runs from **5 January 2022** (Column M) through **5 December 2035** (Column FX) — **168** columns. This is wide enough for all supported terms.

Regenerate templates with `bash docs/payment-schedule-templates/run-fix-templates.sh` after editing layout so **TOTAL PAID**, **Current Balance**, and **Payment Progress** stay consistent.

## Portal / Edge Function

`fetch-google-sheets` resolves **how many** month columns to read from **`profiles.payment_plan_months`** (default 36 if unset) and **clamps** reads to the column before **Next Payment** (FY). It locates **TOTAL PAID** (FZ), **Current Balance**, and **Payment Progress** from header text where possible so the 168-column layout keeps working without hardcoded column letters.

## Template instructions

Operator setup instructions are maintained in a **standalone markdown file**: **[COLLECTION_SCHEDULE_TEMPLATE_INSTRUCTIONS.md](./COLLECTION_SCHEDULE_TEMPLATE_INSTRUCTIONS.md)**. They are **not** embedded as a separate tab inside the `.xlsx` template files.
