# Track B — Integrator access to Warwickshire's Odoo.sh + LakeCity DB, and deploy the addons

Goal: NJere has (a) Odoo.sh project collaborator rights on the LakeCity project, (b) an internal user on the production database with an API key, and (c) both custom addons (`lakecity_crm`, `lakecity_loan_management`) installed and smoke-tested on production.

Two distinct grants are needed. They are **separate**: being a collaborator on Odoo.sh does not auto-grant you a database user, and vice versa.

| Grant | Where | Purpose |
|---|---|---|
| Odoo.sh collaborator | <https://www.odoo.sh> → LakeCity project → Settings → Collaborators | Push Git branches that trigger builds, view logs, SSH into containers |
| Database internal user | LakeCity DB UI → Settings → Users & Companies → Users | Log in as a person, install apps, generate API keys, read invoice/payment data |

## B1. Odoo.sh project collaborator

### B1.1 Warwickshire grants access

The Warwickshire owner of the Odoo.sh project does:

1. Sign in at <https://www.odoo.sh>.
2. Open the **LakeCity** project.
3. *Settings → Collaborators → Add* with NJere's GitHub username.
4. Set role: **Admin** (allows pushing branches, triggering rebuilds, accessing logs and DB shells). If Warwickshire prefers least-privilege first pass, *Developer* is enough for B3 deploy but not for incident debugging — recommend Admin.

### B1.2 NJere validates

NJere's engineer:

1. Accept the GitHub repo invite (email + GitHub notification).
2. Clone:

```bash
git clone git@github.com:<warwickshire-org>/<lakecity-odoosh-repo>.git
cd <lakecity-odoosh-repo>
git fetch --all
git branch -a
```

3. Confirm the standard Odoo.sh branch layout. You should see at least:
   - `production` — mapped to the production environment
   - `staging` — mapped to the staging environment
   - `dev` (or `development`) — mapped to development containers

   If the layout differs (some Warwickshire setups use `main` instead of `production`), record the actual mapping before pushing in B3.

4. From the Odoo.sh dashboard, hover the **Production** environment row → confirm:
   - Production URL (`https://<host>` — record this for Track C as `odoo_url`)
   - Database name (record as `odoo_db`)

### B1.3 Sign-off

- [ ] NJere accepted the collaborator invite.
- [ ] Repo cloned locally.
- [ ] Production URL and DB name recorded.

## B2. Internal database user + API key

### B2.1 Warwickshire creates the user

The Warwickshire admin (logged into the production DB) does:

1. *Settings → Users & Companies → Users → New*.
2. Login email: a fresh dedicated address NJere controls (e.g. `odoo-integrator+lakecity@njere.com`). **Do not reuse a personal email**; we'll rotate this account in Track C hardening.
3. Name: `NJere Integrator`.
4. Access Rights — minimum required for installing apps and reading accounting data:

| App / Group | Setting |
|---|---|
| Administration | **Settings** (full settings access — needed to install apps and manage Vault secrets in Odoo) |
| Sales | **Administrator** |
| CRM | **Administrator** |
| Accounting | **Billing Administrator** (or **Accountant** — both can read invoices/payments; Billing Admin can also post them) |
| Lakecity CRM (after B3 install) | **Manager: Full Access** |
| Lakecity Loan Manager (after B3 install) | **Lakecity Loan Manager** |

5. Save and click **Send Password Invitation** so the user gets an activation email.

### B2.2 NJere activates and generates API key

1. Open the activation email → set a password → enroll 2FA (TOTP, mandatory for any account that holds an API key).
2. *Preferences → Account Security → New API Key*:
   - Label: `NJere integration — StandLedger portal — <today's date>`
   - **Copy the key immediately** (Odoo only shows it once). Store in NJere's secrets manager (1Password / Bitwarden), not in plain text or this repo.
3. Capture the four values for Track C:

   | Vault key (set in Track C) | Where to find the value |
   |---|---|
   | `odoo_url` | Odoo.sh production URL from B1.2 (e.g. `https://lakecity.odoo.com`). **No trailing slash.** |
   | `odoo_db` | Odoo.sh production database name from B1.2 (e.g. `lakecity-production-12345`) |
   | `odoo_uid` | NJere user's user ID. Open *Settings → Users → NJere Integrator* and read `id=<N>` from the URL. Record as a string of digits. |
   | `odoo_api_key` | The key you just copied. |

### B2.3 Sanity-check the credentials with a one-liner

Before handing off to Track C, prove the credentials work end-to-end with this curl:

```bash
ODOO_URL="https://<production-host>"
ODOO_DB="<db-name>"
ODOO_UID="<integer>"
ODOO_API_KEY="<api-key>"

curl -sS -X POST "$ODOO_URL/jsonrpc" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
        --arg db "$ODOO_DB" \
        --arg uid "$ODOO_UID" \
        --arg key "$ODOO_API_KEY" \
        '{jsonrpc:"2.0",method:"call",id:1,params:{
          service:"object",method:"execute_kw",
          args:[$db,($uid|tonumber),$key,
                "res.users","read",[[($uid|tonumber)],["login","name"]]]
        }}')" | jq .
```

Expected output: `result: [{ id, login: "...", name: "NJere Integrator" }]`. If you get an authentication error, the most common cause is a wrong `odoo_uid` (must be the integer from the user URL, not the username/email).

### B2.4 Sign-off

- [ ] NJere can log into the production DB.
- [ ] 2FA enrolled.
- [ ] API key generated and stored in NJere's secrets manager.
- [ ] All four values (`odoo_url`, `odoo_db`, `odoo_uid`, `odoo_api_key`) captured.
- [ ] curl JSON-RPC sanity check returns the user record.

## B3. Adapt addons to Odoo 19 and deploy

The addons in this repo were already updated to Odoo 19 (see commit history for "Bump LakeCity addons to Odoo 19"). At the code level you should NOT need further migration; B3 is purely a deployment exercise.

### B3.1 Pre-flight check on the addon code

```bash
cd <this-repo>/odoo/addons
grep -nE 'version.*"17\.' lakecity_crm/__manifest__.py lakecity_loan_management/__manifest__.py
```

Should return nothing. If it returns lines, the manifests still target 17 — fix before continuing (search for "B3 manifest bump" in the commit history of this repo for the canonical patch).

```bash
grep -RnE '<tree[ >]|view_mode.*"tree' lakecity_crm lakecity_loan_management
```

Should return nothing. `<tree>` was deprecated in Odoo 17 and removed in Odoo 18. Both addons must use `<list>` everywhere.

### B3.2 Copy addons into the Odoo.sh repo

```bash
cd <path-to-cloned-odoosh-repo>
git checkout staging
git pull
git checkout -b feature/lakecity-addons-odoo19

# Lay them out where Odoo.sh's addons_path expects them.
mkdir -p addons
cp -r <this-repo>/odoo/addons/lakecity_crm addons/
cp -r <this-repo>/odoo/addons/lakecity_loan_management addons/

git add addons/lakecity_crm addons/lakecity_loan_management
git commit -m "Add LakeCity CRM and BNPL addons (Odoo 19)"
git push -u origin feature/lakecity-addons-odoo19
```

> **Heads up — addons_path layout.** Odoo.sh by default expects custom addons under `<repo-root>/<module>/` *or* under `<repo-root>/addons/<module>/`. Inspect the repo's `requirements.txt` and any `Procfile`/`runtime.txt` for an explicit `addons_path` override before deciding where to drop the folders. The default `addons/` placement above is correct for ~95% of projects.

### B3.3 Trigger the staging build

1. Open the LakeCity project on Odoo.sh.
2. Click the **`feature/lakecity-addons-odoo19`** branch in the left rail. Odoo.sh auto-spawns a build.
3. Watch the **Logs** tab. The build should:
   - Detect new modules.
   - Run `odoo -i lakecity_crm,lakecity_loan_management` (or `--update=all` depending on project config) automatically on the first build.
   - Settle to a green status.
4. Open the staging URL → *Apps* → search "Lakecity" → confirm both modules show **Installed**. If they show as available but not installed, click *Install* on each.

### B3.4 Smoke test on staging

#### `lakecity_crm` smoke test

1. Apps → Lakecity → Collection Schedules → New.
2. Create a schedule:
   - Stand Number: `24000`
   - Customer: any test partner
   - Documentation Fee: 0
   - Deposit: 5000
   - Total Price: 24000
   - Term: 24 months
   - Start Date: 5th of next month
3. Save. Verify:
   - `Monthly Payment` computed to `791.67` (= round((24000-5000)/24, 2)).
   - 24 child rows under "Monthly Payments" tab, all with day=5 due dates.
   - `End Date` = start_date + 23 months.

#### `lakecity_loan_management` smoke test

1. Apps → Lakecity Loans → Loan Contracts → New.
2. Fill: partner, stand number `24000`, term 36, payment_start_date today's 5th.
3. Total Price `36000`, Deposit `6000`, VAT inclusive ticked.
4. Save → click **Generate Schedule**. Verify 36 installments at `833.33` each.
5. Open the **Payments** tab → add a payment of `2500` posted today.
6. Verify on the Installments tab:
   - First installment shows `amount_paid = 833.33`, state `paid`.
   - Second installment shows `amount_paid = 833.33`, state `paid`.
   - Third installment shows `amount_paid = 833.34` (or similar, oldest-due-first allocation).
   - `accrued_amount`, `total_paid` on the contract update accordingly.

If either smoke test fails, fix on the `feature/lakecity-addons-odoo19` branch and re-push — Odoo.sh will rebuild automatically.

### B3.5 Promote to production

1. On Odoo.sh, drag the `feature/lakecity-addons-odoo19` branch onto the **Staging** environment slot if not already there. Watch the build.
2. Once staging is green, **merge `feature/lakecity-addons-odoo19` into `production`** via the Odoo.sh UI or via a standard PR + merge in GitHub.
3. Watch the production rebuild log. On success, log into the production URL → *Apps → Update Apps List → Install* both modules (production builds don't always auto-install new modules; the apps list update is mandatory).
4. Re-run the smoke tests from B3.4 on production with a real (small) test record. Delete the test record after.

### B3.6 Sign-off

- [ ] Both addons show **Installed** on production.
- [ ] CRM smoke test passes on production.
- [ ] Loan smoke test passes on production.
- [ ] No errors in the Odoo.sh production logs for 30 minutes after install.
- [ ] (Recommended) Tag the merged production commit: `git tag lakecity-addons-v19.0.1 && git push --tags`.

When all six are green, hand off to [Track C](./track-c-vault-wiring.md).

## Recovery / rollback

If production breaks after the merge:

1. On Odoo.sh, click the **Production** environment → **Branches** dropdown → select the previous production commit (`production~1`) → **Force redeploy**. This restores the prior code in 3–5 minutes.
2. If both modules need to be uninstalled cleanly first (rare — only if a model migration corrupted data), use the Odoo.sh shell:

```bash
psql $PG_URL -c "UPDATE ir_module_module SET state='to remove' WHERE name IN ('lakecity_crm','lakecity_loan_management');"
```

   Then redeploy. Open a CSM ticket if you need help with module-data cleanup.
