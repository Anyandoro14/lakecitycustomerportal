# Odoo Staging: dd/mm/yyyy date format + receipt-date / balance QC

**Scope:** Staging only. Do **not** change Production language or payment dates unless explicitly approved.

**Source of truth for receipt dates:** Google Drive Master List  
`https://docs.google.com/spreadsheets/d/1LipmKyODkB9cBmQXCy1gd8tBcxhz6aO0`  
tab **Transaction Detail**, column **Receipt Date** (UK day-first).

Production Odoo host (reference only): `https://lakecity-standledger.odoo.com`  
Staging: open the **Staging** branch build URL from Odoo.sh (do not use Production).

---

## 1) Language Date Format on Staging (UI-only)

1. Log into **Staging** (Odoo.sh → Staging branch → Connect).
2. Enable developer mode if needed.
3. **Settings → Translations → Languages**.
4. Open the language used by staff (prefer **English (UK) / `en_GB`** if installed; otherwise the active English language).
5. Set **Date Format** to `%d/%m/%Y` (and optionally **Time Format** to `%H:%M:%S`).
6. Save. Have one user refresh and confirm a date picker / list date shows **dd/mm/yyyy** (e.g. 3 April → `03/04/2026`, not `04/03/2026`).

Do **not** push this as Production until Staging QC of dates/balances is signed off.

Optional: set the same format on **company** / user preferences if your Odoo 19 build exposes per-user language overrides — still Staging only.

---

## 2) What “swapped dates” look like

Strings like `03/04/2026` are ambiguous:

| Intent (UK) | ISO | Wrong US parse |
|-------------|-----|----------------|
| 3 April 2026 | `2026-04-03` | `2026-03-04` |
| 7 January 2026 | `2026-01-07` | `2026-07-01` |

Only dates where **day ≤ 12 and month ≤ 12 and day ≠ month** can silently swap.

Sheet workbook dates are real calendar values (not ambiguous once stored). Risk is **import / form / manual entry into Odoo** using US-first parsing.

---

## 3) Sheet risk universe (already measurable without Odoo)

From Master List **Transaction Detail** (as of the xlsx pull used for this workstream):

| Metric | Count |
|--------|------:|
| All receipt rows | 4757 |
| On/after accounting start `2026-01-01` | 1783 |
| Ambiguous day/month (swap-possible) post-cutoff | **1166** |
| Unambiguous post-cutoff (day > 12) | 617 |

Master List internal checks (paid vs Transaction Detail sum; purchase − paid vs balance): **0 mismatches** on this file — sheet is coherent.

Re-run anytime:

```bash
node scripts/qc-odoo-receipt-dates-vs-master.mjs \
  --master-xlsx /path/to/Warwickshire\ Sales\ Master\ List\ Final.xlsx \
  --sheet-only --out-dir /tmp/odoo-date-qc

node scripts/qc-odoo-stand-balances-vs-master.mjs \
  --master-xlsx /path/to/Warwickshire\ Sales\ Master\ List\ Final.xlsx \
  --sheet-only --out-dir /tmp/odoo-balance-qc
```

---

## 4) Match Odoo Staging payments → count real fixes

### Export from Staging

**BNPL payments** (`lakecity.loan.payment`): list view → export CSV with at least:

- Stand Number  
- Payment Date  
- Amount  
- Reference / name  
- id  
- external_uid (if present)

**Contracts** (for balance QC): export

- Stand Number  
- Current Balance  
- Total Paid  
- Total with tax (if available)

### Run compare

```bash
# Date swaps (sheet Receipt Date vs Odoo payment_date)
node scripts/qc-odoo-receipt-dates-vs-master.mjs \
  --master-xlsx ./Master.xlsx \
  --odoo-payments-csv ./staging-payments.csv \
  --out-dir ./tmp/odoo-date-qc

# Per-stand balances
node scripts/qc-odoo-stand-balances-vs-master.mjs \
  --master-xlsx ./Master.xlsx \
  --odoo-contracts-csv ./staging-contracts.csv \
  --out-dir ./tmp/odoo-balance-qc
```

Outputs:

- `correction-candidates.csv` — Odoo date equals **swapped** sheet date (high confidence fix list)  
- `mismatches.csv` — amount matches but date differs, or missing in Odoo  
- `odoo-balance-exceptions.csv` — Master balance vs `current_balance` / optional 121000 AR

**How many dates need fixing?** = row count of `correction-candidates.csv` after Staging export (not inventable without that export). The **1166** figure is the maximum post-cutoff ambiguous set that *could* have been mistyped; only swap matches against Odoo are confirmed fixes.

---

## 5) Safe Staging correction plan (after QC list review)

1. Set language Date Format `%d/%m/%Y` on Staging (section 1).  
2. Backup / snapshot Staging DB (Odoo.sh backup).  
3. Review `correction-candidates.csv` with ops (sample 10–20 stands against paper/PDF receipts).  
4. For each approved row, correct **`lakecity.loan.payment.payment_date`** (and linked Stand Sales JE / `account.payment` date if already posted):
   - If BNPL line is linked to a **paid** accounting payment, cancel/adjust that payment first (module locks amount/date while AP is paid) — see `loan_payment.py` write guards.  
   - Prefer a small Staging shell/script that sets date → sheet ISO and rebuilds allocations; do **not** run on Production.  
5. Re-run QC scripts; expect `likely_day_month_swaps → 0`.  
6. Re-run stand balance QC; investigate remaining exceptions (missing receipt, misallocation, VAT/price) separately from date swaps.  
7. Only then propose Production language + data fix (explicit approval).

---

## 6) Stand Sales vs client balance (Alex report)

### How Stand Sales is identified

| Piece | Value | Source |
|-------|-------|--------|
| Journal | **Lake City Stand Sales**, code **`STND`** | `data/lakecity_stand_accounting_journals.xml` |
| Trade receivable (client AR GL) | COA **`121000`** Account Receivable | `LAKECITY_STAND_ACCOUNT_CODES["receivable"]` in `lakecity_stand_accounting.py` |
| Stand Sales JE link | `account.move.lakecity_loan_contract_id` + `lakecity_stand_move_purpose` | `account_move.py` |
| Client / loan balance | `lakecity.loan.contract.current_balance` (= `total_with_tax − total_paid`, ≥ 0) | `loan_contract.py` |
| **Match key** | **`stand_number`** (normalized; never partner alone) | One partner can own multiple stands — partner-level 121000 mixes stands |

**Stand Sales balance (per stand)** = sum of posted `account.move.line` debit−credit on **121000** where `move.lakecity_loan_contract_id` = that stand’s contract.

**Do not** use liquidity/bank codes (`101410` CABS, `101412` Waltich, …) as client balances. Do not invent account numbers.

### External check (Master List)

- **Balance Remaining** / **Actual Total Paid** on Master List tab  
- Sum of **Transaction Detail → Receipt Amount** per stand  

On the current Master List file: **0** sheet-internal paid/balance exceptions (txn sum matches Actual Total Paid).

### Staging export → exceptions list

On **Staging** Web Shell only:

```text
exec(open("…/lakecity_loan_management/scripts/odoo_sh_export_stand_balances.py").read())
```

Then:

```bash
node scripts/qc-odoo-stand-balances-vs-master.mjs \
  --master-xlsx ./Master.xlsx \
  --odoo-contracts-csv /tmp/lakecity_stand_balance_export.csv \
  --out-dir ./tmp/odoo-balance-qc
```

`exceptions.csv` columns: `stand_number`, `odoo_client_balance`, `stand_sales_balance`, `master_balance`, `difference`, `likely_cause`.

Likely causes (heuristics):

| Cause code | Meaning |
|------------|---------|
| `stand_sales_je_misallocation_or_orphan_ar` | Master agrees with BNPL; 121000 wrong |
| `bnpl_schedule_total_paid_wrong_check_date_swaps` | Master agrees with 121000; contract paid/balance wrong |
| `missing_or_extra_receipt_check_date_swaps` | Paid totals disagree — check date QC list |
| `contract_missing_in_odoo` | Master stand not imported |
| `odoo_stand_not_on_master_list` | Odoo-only stand |

### Sample mismatches

Live Staging exceptions are **not** available without the export above (no Staging API token in CI). Fixture self-test examples:

| Stand | Client bal | Stand Sales | Diff | Likely cause |
|------:|----------:|------------:|-----:|--------------|
| 1516 | 6425 | 5000 | −1425 | `stand_sales_je_misallocation_or_orphan_ar` |
| 999 | 40 | 40 | vs master 50 | `missing_receipt_or_date_swap_affecting_paid_total` |

### Proposed fix path (Staging → Alex approval → Production later)

1. Set Staging language Date Format `%d/%m/%Y` (section 1).  
2. Export Staging balances; run QC → `exceptions.csv`.  
3. Cross-check high-diff stands against `correction-candidates.csv` (date swaps) and Transaction Detail.  
4. Fix order on Staging only:  
   a. Correct swapped **payment dates** (rebuild allocations / Stand Sales receipt JEs).  
   b. Post missing receipts from Master Transaction Detail (idempotent `external_uid`).  
   c. Investigate remaining 121000 vs contract drift (orphan AR, cutover opening JE, misallocated partner).  
5. Re-export until client ↔ Stand Sales ↔ Master align within tolerance (default $1).  
6. **No Production writes** until Alex signs off.

---

## 7) Code follow-ups in this repo

- Receipt intake / API date parsing prefers **dd/mm/yyyy** before US-style ambiguity (`_lakecity_parse_payment_date`).  
- QC scripts + Staging export helper — analysis only; no Production writes.
