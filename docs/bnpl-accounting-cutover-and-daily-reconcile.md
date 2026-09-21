# BNPL accounting cutover & daily three-way reconcile

Operator runbook for LakeCity BNPL books starting **2026-01-01**.

Related code: `scripts/lib/accounting-cutoff.mjs`, Odoo addon `lakecity_loan_management` **≥ 19.0.1.0.69**, `scripts/daily-bnpl-three-way-reconcile.mjs`.

---

## 1. Cutover JE pattern (Memory Mutande)

Books start on the accounting start date (default **2026-01-01**, overridable with `LAKECITY_ACCOUNTING_START_DATE` or company field **Accounting start date**).

For each stand that already has an Odoo loan contract:

| Step | Date | Debit | Credit | Notes |
|------|------|-------|--------|-------|
| JE1 — stand sale / contract | **2026-01-01** | AR `121000` | Contract liability `212010` + Deferred VAT `251020` | Gross = Sales Master / Collection **TOTAL PRICE** |
| Opening receipt (all cash **before** 2026-01-01) | **2026-01-01** | **Retained Earnings `303000`** | AR `121000` | **Not** CABS / bank — keeps opening cash clean |
| Revenue / VAT release | **2026-01-01** | CL + Deferred VAT | Revenue `401000` + VAT output `251010` | Pro-rata on opening paid |
| Live receipts **on/after** 2026-01-01 | True receipt date | Bank / cash (see mapping) | AR | Individual payments |

Portal history for 2025 payments is unchanged. Odoo must not keep individual pre-start receipt JEs that debit bank.

### Run cutover

1. Upgrade **`lakecity_loan_management` to 19.0.1.0.69+** on Odoo.sh; take a backup.
2. Preview:

```bash
npm run odoo:accounting-cutover:dry-run
# or
node --env-file=.env scripts/cutover-odoo-from-posted-payments.mjs --dry-run
```

3. Post (deletes pre-start receipts, posts opening lumps on equity):

```bash
node --env-file=.env scripts/cutover-odoo-from-posted-payments.mjs --force
```

4. If leftover 2025 stand-sales JEs remain:

```bash
npm run odoo:accounting-cutover:sweep
```

5. Sheet-driven alternative (Collection Schedule amounts):

```bash
node --env-file=.env scripts/post-opening-balance-jes.mjs --dry-run
node --env-file=.env scripts/post-opening-balance-jes.mjs --force
```

After upgrade, if opening lumps previously hit **101410 CABS**, re-run cutover/`--force` so receipts re-post to **303000**.

UI: **Lakecity Loans → Accounting start cutover**.

---

## 2. Date parsing rules

All Collection Schedule / Sales Master imports prefer **day-first** (**dd/MM/yyyy**, en-GB / Zimbabwe).

| Input | Result |
|-------|--------|
| `05/01/2026` | **2026-01-05** (5 Jan), flagged ambiguous (US alt 1 May) |
| `13/02/2026` | **2026-02-13** (unambiguous) |
| `5 January 2026` | **2026-01-05** |
| `2026-03-15` | ISO passthrough |

Never use silent US `new Date("01/02/2026")` for slash dates. Shared helper: `parseSheetDate()` in `scripts/lib/accounting-cutoff.mjs`.

Unparseable or day/month-swap-suspect dates appear in the daily reconcile report (`ambiguous_date_day_month`, `wrong_date_day_month_swap`).

Self-test:

```bash
node scripts/lib/accounting-cutoff.self-test.mjs
```

---

## 3. Bank / cash account mapping

Default liquidity for **live** (post-cutoff) receipts is **CABS USD Main `101410`** via company **BNPL collections journal**.

| `lakecity.loan.payment` source | Default liquidity | Company journal override |
|--------------------------------|-------------------|---------------------------|
| `bank_transfer`, `card`, `paystack`, `paypal`, `flutterwave`, `odoo`, `manual` | `101410` CABS USD | BNPL collections journal |
| `cash` | collections (or cash journal) | **BNPL cash journal** |
| `ecocash`, `mobile_money` | collections (or EcoCash journal) | **BNPL EcoCash / mobile money journal** |
| `kuva` | collections (or Kuva journal) | **BNPL Kuva journal** |

Pre-cutoff / `opening-balance-*` lumps always debit **Retained Earnings `303000`** (company field **Opening equity** can point at `305000` Opening Balance Equity if preferred).

Configure on **Settings → Companies → Lakecity BNPL**.

---

## 4. Daily three-way reconcile

Compares per stand:

1. **Sales Master** — stand price, customer  
2. **Collection Schedule** — TOTAL PRICE, TOTAL PAID, Current Balance, month-grid dates/amounts  
3. **Odoo** — contract totals, posted payments, receipt JE debit accounts  

### Required columns

**Collection Schedule** (CSV preferred): `Stand Number`, `TOTAL PRICE`, `TOTAL PAID`, `Current Balance` (or `Accounts Receivable`). Optional: `START DATE`, month columns with date headers.

**Sales Master** (optional CSV/XLSX): `Stand Number`, price column (`TOTAL PRICE` / `Stand Price` / `Sale Price`), optional customer name.

Do **not** hard-code Google Sheet IDs — export CSV/XLSX and pass paths (or set env vars).

### Run

```bash
# Collection + Sales Master files only
node scripts/daily-bnpl-three-way-reconcile.mjs \
  --collection /path/to/collection.csv \
  --sales /path/to/sales-master.csv

# Include live Odoo (needs token; addon ≥ 19.0.1.0.69 for reconcile-export)
node --env-file=.env scripts/daily-bnpl-three-way-reconcile.mjs \
  --collection /path/to/collection.csv \
  --sales /path/to/sales-master.csv \
  --odoo

# Or against a saved Odoo JSON
curl -H "Authorization: Bearer $LAKECITY_LOAN_API_TOKEN" \
  "$ODOO_ORIGIN/lakecity/api/v1/loan/reconcile-export" \
  > /tmp/odoo-reconcile.json
node scripts/daily-bnpl-three-way-reconcile.mjs \
  --collection /path/to/collection.csv \
  --odoo-json /tmp/odoo-reconcile.json
```

Env shortcuts: `COLLECTION_CSV_PATH`, `SALES_MASTER_PATH`, `LAKECITY_ACCOUNTING_START_DATE`, `RECONCILE_OUT_DIR`, `RECONCILE_MONEY_TOLERANCE` (default $1).

Reports land in `docs/output/reconcile/`:

- `bnpl-reconcile-YYYY-MM-DD.csv`
- `bnpl-reconcile-YYYY-MM-DD.md`

Exit code `2` if any **critical** issues remain.

npm alias:

```bash
npm run odoo:bnpl:reconcile -- --collection ./collection.csv --odoo
```

---

## 5. What to do when rows fail

| Issue code | Severity | Action |
|------------|----------|--------|
| `pre_cutoff_hit_bank` | critical | Upgrade to 19.0.1.0.69+, re-run cutover `--force` so opening debit is `303000` |
| `missing_receipt_unposted` | critical | `import-post-cutoff-sheet-payments.mjs` or receipt intake QC |
| `amount_mismatch` / `balance_mismatch` | critical/high | Fix sheet arithmetic first; then re-import / cutover |
| `stand_price_mismatch` | high | Align Sales Master ↔ Collection ↔ Odoo JE1 |
| `manual_total_error` | high | Fix `TOTAL PRICE ≈ TOTAL PAID + Current Balance` on sheet |
| `wrong_date_day_month_swap` / `ambiguous_date_day_month` | high/medium | Confirm receipt; re-post with day-first date |
| `liquidity_account_unexpected` | low | Confirm cash/EcoCash/Kuva journal mapping on company |
| `missing_in_odoo` | high | Run collection CSV/XLSX import upsert |

Tolerance for money compares defaults to **$1** (`RECONCILE_MONEY_TOLERANCE`).

---

## 6. Quick checklist (daily)

1. Export Collection Schedule (+ Sales Master if prices changed) to CSV.  
2. Run three-way reconcile with `--odoo`.  
3. Fix **critical** rows before posting new receipts.  
4. Import only **post-cutoff** sheet payments.  
5. Keep cutover date configurable but default **2026-01-01**.
