# Bank reconcile variance correction SOP

Goal: **portal receipts become journals that clear against bank statement lines** — do not manually delete “duplicates” that are the same economic payment.

## Happy path

1. Portal / Form QC posts `lakecity.loan.payment` (with `deposited_to` when known).
2. Stand-sales accounting posts receipt JE (Dr liquidity / Cr AR) **or** legacy `account.payment` — memo/ref include `Stand N`.
3. Bank statement import creates statement lines.
4. LakeCity three-way check (portal stand + partner/contract stand + bank label stand + amount) allows match; failures land in **Bank reconcile discrepancies** and **Daily exceptions**.

## When variances appear

| Symptom | Prefer | Avoid |
|---------|--------|-------|
| Same amount, same stand, different date | Redate the Odoo receipt / payment to the bank date (or accept bank date and note) | Deleting the portal-originated JE |
| Portal posted twice | Cancel/void the **duplicate Odoo** payment; keep bank line + one portal payment | Deleting the bank statement line |
| Bank only (no portal) | Add missing portal/Form intake → QC → post, then match | Posting a second bank-side cash JE by hand |
| Portal only (not on bank yet) | Leave unmatched until statement arrives; investigate channel/`deposited_to` | Forcing reconcile to unrelated lines |
| Stand mismatch on label | Fix bank narration / payment ref; log discrepancy until stands agree | Silent reconcile |

## Daily checklist

1. Import bank statements for the day.
2. Open **Lakecity Loans → Daily exceptions** and **Bank reconcile discrepancies**.
3. Resolve open items before posting new receipts for the same stands.
4. Email digest (optional): export open daily exceptions list for the day.

## Related config

- Form **Deposited to:** → liquidity (`docs/make-receipt-intake-odoo.md`)
- Outstanding Tanaka maps: `docs/meeting-2026-09-23-outstanding.md`
