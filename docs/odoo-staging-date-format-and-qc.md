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

## 6) Stand Sales vs client balance (match key)

| Concept | How identified |
|---------|----------------|
| Stand Sales journal | `Lake City Stand Sales` / code `STND` (`lakecity_stand_accounting_journals.xml`) |
| Client trade AR | COA **`121000`** Account Receivable |
| Contract balance | `lakecity.loan.contract.current_balance` |
| Match key | **`stand_number`** (normalize numeric stands) |
| External check | Master List **Balance Remaining** + Transaction Detail paid sum |

Likely causes when balances differ: date swap (wrong period / allocation), missing Odoo receipt, opening-balance cutover drift, or AR JE vs schedule field drift (`121000` residual ≠ `current_balance`).

Liquidity / bank codes (`101410` CABS, `101412` Waltich, etc.) are **not** client balances — do not invent or substitute account numbers in QC.

---

## 7) Code follow-ups in this repo

- Receipt intake / API date parsing prefers **dd/mm/yyyy** before US-style ambiguity (`_lakecity_parse_payment_date`).  
- QC scripts above — analysis only; no Production writes.
