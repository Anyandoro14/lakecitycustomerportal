# BNPL deposit tagging & bank-statement reconcile

Operator notes for LakeCity BNPL on **main** (`lakecity_loan_management` **≥ 19.0.1.0.77**).

**Daily Reconciliation Odoo app is not used on main.** Use standard bank statement reconcile + LakeCity three-way stand check + Daily exceptions.

**Staging-first:** upgrade Staging to **19.0.1.0.77** and confirm Form labels before Production. No Production deploy from this change alone.

## Form Deposited to: → liquidity

| Form label | COA |
|------------|-----|
| Cash | `Cash` `101416` |
| CABS USD | `CABS - Main USD Current Account - 1129888509` `101410` |
| Cabs Zig | `CABS - Main ZiG Current Account - 1003526446` `101411` |
| Jumpstart | `Jumpstart (CAD)` `101418` |
| Ecocash | `Ecocash USD` `101417` |
| CBZ USD | `CBZ - Main USD Current Account - 27794540028` `101419` |
| Cabs Waltich | `CABS - Waltich - 975` `101412` |
| CBZ ZIG | **BLOCKED** — no CBZ ZiG/ZWG liquidity COA on main (chart XML + Account.xlsx). Label wired; pick/find fail-closed until Tanaka/Alex adds account. Do not invent codes. |
| EcoCash ZIG | **BLOCKED** — only `Ecocash USD` `101417` exists; no EcoCash ZiG/ZWG cash COA. Label wired; fail-closed until account exists. |

Aliases (historical submissions): **Cabs** → **CABS USD**, **CBZ** → **CBZ USD**.

Self-test: `npm run test:deposited-to`

**Upgrade note:** chart XML is `noupdate="1"`. Module upgrade to **19.0.1.0.74** runs a post-migrate that creates `101412` if missing. Mapping is by account code — no bank journal is seeded from this repo (Cash/CABS journals live in the Staging DB). After upgrade, confirm a bank journal for **Waltich** pointing at `101412` exists; create it in Accounting if not. **CBZ ZIG** / **EcoCash ZIG** need new COA rows on Staging before liquidity posting can succeed for those Form options.

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
