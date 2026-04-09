# BNPL ledger — Collection Schedule specification

This document defines how **payment schedule** workbooks must behave for the customer portal and finance ops. You can apply these rules when building or widening templates before uploading to Google Sheets.

## Product model

- **BNPL-style ledger:** Each row is one lending contract (one stand / customer). **Column I — Total price** is the **base contract price** (principal cap before financing mechanics).
- **Deposit (typically Column H)** is deducted **before** splitting the remainder into instalments.
- **Financed amount** = Total price − Deposit. That amount is repaid via the monthly columns (Column **M** onward), each instalment due on the **5th** of the month.
- **Before any instalment payments are recorded** in Columns M onward, **Current Balance** must show the **net financed balance**: **Total price − Deposit** (i.e. what remains to be paid through instalments, assuming deposit is already settled).

## Totals and formulas (per data row)

Let:

- `I` = Total price (base)
- `H` = Deposit (adjust column letter if your header says “Deposit” elsewhere; the fix script discovers by header name when possible)
- `M` … `lastMonth` = monthly instalment **amounts actually paid** (empty until paid)

Recommended Excel formulas (row `r`):

1. **TOTAL PAID**  
   `=H{r}+SUM(M{r}:{lastMonth}{r})`  
   Deposit counts toward what has been paid against the contract.

2. **Current Balance**  
   `=I{r}-H{r}-SUM(M{r}:{lastMonth}{r})`  
   Equivalent to **Total price − (Deposit + sum of instalment cells)**. When no instalments are paid yet, this equals **I − H**.

3. **Payment progress** (contract % cleared)  
   `=IF(I{r}=0,"", (H{r}+SUM(M{r}:{lastMonth}{r}))/I{r})`  
   Format as percentage. Uses **Total price** in **I** as the denominator.

4. **Monthly instalment (Column K or labelled “Payment” / “Instalment”)**  
   For **equal** instalments over **N** months:  
   `=(I{r}-H{r})/N`  
   where **N** is the term for that tab (12, 24, …, 120). You may type **N** per template or reference a single cell that holds the term.

## Term lengths

Supported terms (one tab per **N**): **12, 24, 36, 48, 60, 72, 84, 96, 120** months. Use the tab name pattern **`Collection Schedule - Nmo`**.

## Dates: 5th of the month and coverage through 2035

- **Due dates** are always the **5th** of the month (align **Payment start date** in Column **L** and each monthly column header to a **5th**).
- **Start dates are not fixed globally** — each contract can start on any allowed 5th; Column **L** holds that contract’s start.
- **Widen** the monthly grid so that schedules can run for the longest contracts in scope. Practically, include **enough month columns** (from **M** rightward) so that:
  - every contract can place **N** instalment columns for **N ∈ {12,…,120}**, and  
  - headers can extend through at least **December 2035** for planning and ledger visibility (add columns as needed when you extend the workbook).

Regenerate templates with `bash docs/payment-schedule-templates/run-fix-templates.sh` after editing layout so **TOTAL PAID**, **Current Balance**, and **Payment Progress** stay consistent.

## Portal / Edge Function

`fetch-google-sheets` resolves **how many** month columns to read from **`profiles.payment_plan_months`** (default 36 if unset). It locates **TOTAL PAID**, **Current Balance**, and **Payment Progress** from header text where possible so layouts can widen without hardcoded column letters.
