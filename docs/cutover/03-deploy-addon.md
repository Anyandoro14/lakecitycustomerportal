# Deploy `lakecity_crm` to Odoo.sh production

This step gets the Odoo addon installed on the production Odoo instance and lays down the matching code on the Lovable Cloud (`main`) side without touching customer-facing UI.

> **Time required**: ~30 minutes hands-on, plus ~10 min for Odoo.sh build and addon install.

## 1. Build the release branch

We do **not** merge `wip/local-v2-and-docs` directly to `main` — that branch contains BNPL v2 work and a customer-visible `/odoo-accounting` route, both of which are out of scope. Instead, run:

```bash
bash scripts/cutover/prepare-release-branch.sh
```

This creates `release/odoo-cutover` from `origin/main` and cherry-picks only:

- `6d6c1b4` — lakecity_crm addon + `odoo-push-schedule` edge function + `contracts.odoo_schedule_id` migration
- `3f7a36c` — `odoo-accounting-data` edge function (read-only, no UI route on `main`)
- `c99810f` — Odoo.sh runbook docs rewrite

Out of scope (will NOT be cherry-picked):

- `09d9368` (BNPL v2 / payment orchestration / CRM v2 stubs)
- Working-tree-only files (`src/pages/OdooAccounting.tsx`, the `/odoo-accounting` route in `src/App.tsx`, `src/integrations/odoo/accounting.ts`)

## 2. Add the cutover artifacts

After the script completes, append the cutover runbooks, scripts, and the new code changes (reverse sync, audit page, etc.) on top of `release/odoo-cutover`:

```bash
git add docs/cutover/ scripts/cutover/ .env.staging.example
git add supabase/functions/odoo-webhook/ supabase/functions/odoo-sync-payment/
git add supabase/functions/odoo-audit-data/ src/pages/internal/ src/integrations/odoo/
git add supabase/functions/generate-monthly-statements/index.ts
git status                       # double-check before committing
git commit -m "Odoo CRM cutover: runbooks, reverse sync, audit page, function flips"
```

## 3. Test the release branch in staging FIRST

Before pushing to production, push the branch to your **staging** Lovable Cloud project (Step 0 of the plan):

```bash
# Assumes your staging Lovable Cloud is connected to a separate GitHub repo or branch.
# If staging tracks the same repo on a different branch, you can test by pushing
# release/odoo-cutover to staging-main:
git push origin release/odoo-cutover
# Then in the staging Lovable Cloud's GitHub integration, point it at this branch
# and trigger a deploy.
```

In staging:

- Confirm the migration `20260506230000_contracts_odoo_schedule_id.sql` applied.
- Confirm `odoo-push-schedule`, `odoo-accounting-data`, and the updated `odoo-webhook`/`odoo-sync-payment` deployed.
- Run the smoke-test checklist in [09-production-cutover.md](09-production-cutover.md) but against staging URLs.

## 4. Push to production main

Once staging is green:

```bash
gh pr create --base main --head release/odoo-cutover \
  --title "Odoo CRM cutover (Step 2-7)" \
  --body "$(cat docs/cutover/PR-TEMPLATE.md)"
# Review on GitHub. Merge the PR.
```

After merge, Lovable Cloud auto-deploys:

- `supabase/migrations/20260506230000_contracts_odoo_schedule_id.sql` is applied to production Postgres.
- `odoo-push-schedule`, `odoo-accounting-data`, updated `odoo-webhook`, updated `odoo-sync-payment`, updated `generate-monthly-statements` are deployed as edge functions.
- No frontend changes — customer portal stays byte-for-byte identical.

## 5. Install the addon in production Odoo

This is the only step Lovable Cloud cannot do for us — it's an Odoo.sh side action.

1. Push to the Odoo.sh `main` branch separately (the addon code lives in `odoo/addons/lakecity_crm/` in the Odoo.sh repo). Confirm Odoo.sh is wired to the same GitHub repo or a sibling repo following the layout in [docs/ODOO_SH_DEPLOY.md](../ODOO_SH_DEPLOY.md).
2. Wait for Odoo.sh build to complete (Branch view → green check).
3. Open production Odoo → **Apps** menu.
4. **Update Apps List** (top-right menu).
5. Search **Lakecity** → click **Install** on **Lakecity CRM — Collection Schedule**.
6. Wait ~30 seconds; the install creates models, views, security groups, and menus.
7. Confirm the new menu **Lakecity → Configuration → Import from XLSX** is visible.
8. Add internal team members to the security groups (Settings → Users & Companies → Groups → search "Lakecity"):
   - **Lakecity CRM — User** for QC reviewers and ops staff
   - **Lakecity CRM — Manager** for accountants and admins

## 6. Smoke-test the addon

In production Odoo, with no XLSX imported yet:

1. Navigate to **Lakecity → Collection Schedules**. The list should be empty.
2. Click **New** → fill in a fake stand:
   - Stand Number: `TEST-001`
   - Customer: any existing partner
   - Sale Price: `10000`
   - Term Months: `12`
   - Start Date: today
3. Save. Confirm 12 payment lines were generated automatically.
4. Open one payment line → confirm `due_date` is the 5th of its month (Day-5 rule).
5. Delete the test record.

If any of those steps fail, **stop the cutover** and debug. Do not proceed to import history until the addon behaves correctly with synthetic data.

## 7. Sign-off

Step 2 is complete when:

- [ ] `release/odoo-cutover` branch created cleanly via the script.
- [ ] Cutover artifacts committed onto the branch.
- [ ] Branch pushed and tested in staging Lovable Cloud + staging Odoo.
- [ ] PR opened, reviewed, merged into `main`.
- [ ] Lovable Cloud auto-deploy completed without errors (check the deploy log).
- [ ] Odoo.sh build green; addon installed in production Odoo.
- [ ] Addon smoke test passed (synthetic stand with 12 generated payments).

Proceed to [04-vault.md](04-vault.md).
