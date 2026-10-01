# BNPL deposit tagging & bank-statement reconcile

Operator notes for LakeCity BNPL on **main** (`lakecity_loan_management` **≥ 19.0.1.0.74**).

**Daily Reconciliation Odoo app is not used on main.** Use standard bank statement reconcile + LakeCity three-way stand check + Daily exceptions.

## Form Deposited to: → liquidity

| Form label | COA |
|------------|-----|
| Cash | `Cash` `101416` |
| Cabs | `CABS - Main USD Current Account - 1129888509` `101410` |
| Cabs Zig | `CABS - Main ZiG Current Account - 1003526446` `101411` |
| Jumpstart | `Jumpstart (CAD)` `101418` |
| Ecocash | `Ecocash USD` `101417` |
| CBZ | `CBZ - Main USD Current Account - 27794540028` `101419` |
| Cabs Waltich | `CABS - Waltich - 975` `101412` |

Self-test: `npm run test:deposited-to`

**Upgrade note:** chart XML is `noupdate="1"`. Module upgrade to **19.0.1.0.74** runs a post-migrate that creates `101412` if missing. Mapping is by account code — no bank journal is seeded from this repo (Cash/CABS journals live in the Staging DB). After upgrade, confirm a bank journal for **Waltich** pointing at `101412` exists; create it in Accounting if not.

## Portal receipt VAT split (Tanaka)

Module **≥ 19.0.1.0.78**. Each posted BNPL receipt (Form QC / portal sync) uses `_lakecity_split_gross_payment`:

- **VAT** = `(15.5 / 115.5) × receipt` (inclusive)
- **Net revenue** = receipt − VAT
- Walkthrough JEs: Dr bank / Cr AR; Dr contract liability + deferred VAT / Cr revenue (`401000`) + VAT Output (`251010`)

Accounts: contract liability `212010`, deferred VAT `251020`, VAT Output `251010`, revenue `401000`.

**Prior overstated revenue** (full gross credited to `401000`): Staging-first wizard **Lakecity Loans → Correct overstated revenue (VAT)** — Preview / dry-run, then Apply. Uses real posted payment amounts only; does not invent figures; does not add Trade Receivables to company OPB (portal brings AR).

Self-test: `npm run test:vat-split`

## Portal ↔ bank matching

Receipt JE / `account.payment` memos include **Stand N**. Statement import runs three-way stand+amount check; mismatches → `lakecity.bank.reconcile.discrepancy` + `lakecity.daily.exception`.

Variance SOP: `docs/bank-reconcile-variance-sop.md`. Self-test: `npm run test:bank-stand-reconcile`.

## Meeting automations (config-driven)

| Menu | Model | Needs Tanaka/Alex data? |
|------|-------|-------------------------|
| Special client maps (Voltage) | `lakecity.special.client.map` | Yes — mapping table |
| Commission rules | `lakecity.commission.rule` | Schedule decision (default monthly) |
| Stand reassignments | `lakecity.stand.reassignment` | Ops dual-control |
| Customer bank accounts | `lakecity.customer.bank.account` | Alex fills CSV |
| Daily exceptions | `lakecity.daily.exception` | Fed from bank discrepancies |

Outstanding list: `docs/meeting-2026-09-23-outstanding.md`. Self-test: `npm run test:meeting-automations`.
