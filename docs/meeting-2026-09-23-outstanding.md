# Meeting 23 Sep 2026 — outstanding info (Tanaka / ops)

Code skeletons for Voltage, commissions, customer↔bank, stand reassignment, and daily exceptions ship in `lakecity_loan_management` **≥ 19.0.1.0.72**. The items below **block activation or ops closure** and are intentionally not invented in code.

## Tanaka / accounting (required to activate automations)

| Item | Needed for | Status |
|------|------------|--------|
| Account + client mapping table for **Voltage** clients (partner / stand → CABS liquidity → revenue → Voltage creditor partner + payable account) | `lakecity.special.client.map` | **Empty maps** — fill in Odoo menu **Special client maps (Voltage)** |
| Bank-specific **creditor entry templates** (Waltage / Voltage postings) | Special-client creditor JE shape | Document in map `notes` until Tanaka template lands |
| Odoo UI **auto-classification rules** (IMTT, internet transfer charges, etc.) | Bank statement import | **Ops in Odoo Accounting** — not coded here |
| **Commission payment schedule** (immediate vs monthly) for Mshambadzi 5%, Ethan, Carol | `lakecity.commission.rule.payment_timing` | Defaults to **monthly**; Alex/Tanaka to confirm |

## Alex / Caroline / portal ops

| Item | Notes |
|------|--------|
| Live Google Form **Deposited to:** dropdown | Code path ready (`deposited_to`). Confirm Form question labels: Cash, Cabs, Cabs Zig, Jumpstart, Ecocash. Redeploy Apps Script from `scripts/google-forms/`. |
| Customer → bank account list | Fill **Customer bank accounts** or CSV template (do not invent rows). |
| Staging upgrade | Upgrade `lakecity_loan_management` to **19.0.1.0.72+**; uninstall orphaned `daily_reconciliation` if still installed from older staging builds. |
| OTP email | **Already on `main`** (SMS/Email 2FA picker + `email_otp_codes` + Resend). See `docs/otp-email-staging-check.md`. |

## Out of scope (ops / governance)

- Fund payment card / consultant invoice documentation (Warwickshire + Tanaka)
- Weekly governance call / SOP updates after tech lands
- Inventory load into Odoo (undecided in meeting)
- Merging PR #19 (partner email sync) — remains parked

## Variance correction SOP

See `docs/bank-reconcile-variance-sop.md` for when to delete / add / redate vs match portal journals to bank lines.
