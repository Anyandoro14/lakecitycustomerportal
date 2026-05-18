# Odoo.sh setup (Odoo 19)

This addon is built for Odoo 19 and deploys normally on Odoo.sh.

## Community & Enterprise on Odoo.sh (paired by the platform)

Your **Git repo** (`Standledger`, etc.) contains only **custom addons** under `odoo/addons/`. It does **not** include [Odoo Community](https://github.com/odoo/odoo) or [Odoo Enterprise](https://github.com/odoo/enterprise) source.

On each build, Odoo.sh mounts **`/home/odoo/src/odoo`** (Community) and **`/home/odoo/src/enterprise`** (Enterprise, if your subscription includes it) **together** for the **Odoo series** configured on the project (this module targets **19.x**). You **cannot** pin independent Community vs Enterprise SHAs from custom code here; if they ever look mismatched, fix it with **Odoo.sh project settings / upgrade / support**, not by editing this repository.

**Verify what a build is actually running** (from **Web Shell** on that build, when the shell is available):

```bash
grep -E '^version_info|^series' /home/odoo/src/odoo/odoo/release.py | head -2
echo -n "Community SHA: " && git -C /home/odoo/src/odoo rev-parse HEAD
if test -d /home/odoo/src/enterprise; then echo -n "Enterprise SHA: " && git -C /home/odoo/src/enterprise rev-parse HEAD; else echo "Enterprise path missing (check subscription / project type)."; fi
```

**Operational rule:** For a given Odoo.sh project and series, Community and Enterprise revisions are **released as a set** by Odoo. To move to a **new** series or fix a broken platform pair, use **Upgrade** / Odoo’s documented Odoo.sh flows and then **push a commit** (below) so branches **rebuild**.

**Trigger fresh builds** after any platform or Git change: Odoo.sh → **Branches** → select **main** / **Staging** → **Rebuild**; or push **any** commit to the branch (including an empty commit from your laptop).

---

## A) Builds: green vs yellow vs red

Per [Odoo’s Odoo.sh build docs](https://www.odoo.com/documentation/19.0/administration/odoo_sh/getting_started/builds.html):

- **Green** — creation finished without **errors**.
- **Yellow** (“almost successful”) — **warnings only** (no blocking errors).
- **Red** — at least one **error** during a build step (checkout, deps, Postgres, Odoo startup, DB load/update, asset build, automated tests…).

Branches are pinned to stages (**Production**, **Staging**, **Development**) in the Odoo.sh project. **Staging** clones your production DB and boots it against the pushed Git revision — failures there are usually startup or module load/update failures (search **`ERROR`** then the first **`Traceback`** inside that build). **Development** builds use fresh DBs and can run huge **test** suites — red there is often unrelated to custom addons unless the log shows **`lakecity_*`** / your XML/Python in the stack.

Operational loop when a build goes **red**:

1. Odoo.sh → **Branches / Builds** → open the failing build → **Logs** (or bundle download).
2. Find the **first** `ERROR`/`Traceback` **that belongs to build creation**, not sporadic runtime (e.g. AI tools firing after login).
3. Fix that root cause, push, hit **Rebuild** if needed.

**Note:** Warnings such as **`Model attribute '_sql_constraints' is no longer supported`** usually come from **other** installed Odoo/community/enterprise models, **not** from Lakecity addons (which declare **`models.Constraint`**). They rarely explain a red build by themselves unless your project treats warnings as failures.

---

## 1) Addon path

Ensure this repo path is available in your Odoo.sh build:

- `odoo/addons/lakecity_branding`
- `odoo/addons/lakecity_loan_management`

## 2) Install module

1. Update Apps List.
2. Install **Inventory** (Stock) and **Sales** if not already present.
3. Install **Lakecity BNPL Loan Management** (pulls in **LakeCity Branding** for ERP + login visuals, plus **Stock** and **Sales** for stand SKUs).

Standalone theming-only: install **LakeCity Branding** without BNPL where appropriate.

## 2b) Git deploy → you must **Upgrade** the addon

Python/XML changes from Git **do not run** until Odoo loads the new module version:

1. Confirm Odoo.sh is building **this** Git repo + branch (wrong repo = “no change” forever).
2. Wait for an Odoo.sh **green build** (or **Rebuild** the branch).
3. **Apps** → menu **Update Apps List** (if needed).
4. Remove the **Apps** filter → search **Lakecity BNPL Loan Management** → open the module form → **Upgrade** (not only browser refresh).

**Important:** `post_init_hook` runs on **install**, not on **upgrade**. Upgrade-time fixes ship in `migrations/<version>/post-migrate.py` (e.g. repairing all‑zero installment schedules).

If installment lines still show **Amount due = 0** after upgrade: open the loan → **Repair zero‑due schedule** (manager button), or **Generate Schedule** again after checking **Total price** / **Deposit**.

## 2c) **Force** upgrade when the UI looks unchanged

Try in order:

1. **Prove Git reached Odoo.sh**  
   Odoo.sh → **Branches** → your branch → latest **Build** → **Logs**. Confirm checkout lists commit SHA that contains `odoo/addons/lakecity_loan_management` changes. If the build is **red/yellow**, fix it first—upgrade won’t load new code reliably.

2. **Rebuild**  
   Same branch screen → **Rebuild** (or push an empty commit). Wait until the build is **green**.

3. **Developer mode + refresh module list**  
   Settings → scroll down → **Activate the developer mode**.  
   **Apps** → **Update Apps List** → confirm.

4. **Upgrade from the module form (not only Kanban)**  
   Apps → remove **“Apps”** filter → search **Lakecity BNPL** → **open the module row** (form view) → **Upgrade**.  
   If **Upgrade** is missing, the DB may think nothing changed: bump `version` in `__manifest__.py` (already bumped in Git), rebuild, repeat steps 2–4.

5. **CLI force (Odoo.sh shell, when available)**  
   Open **Web Shell** / SSH for that **staging** build (Odoo docs vary by project). Typical pattern (adjust DB name and Odoo binary path—often `/home/odoo/src/user/` or platform docs):

   ```bash
   odoo-bin -c odoo.conf -d YOUR_DATABASE_NAME -u lakecity_loan_management --stop-after-init
   ```

   Run only on **staging** until you’re confident; production equivalent is usually Odoo.sh **Scheduled Action / Support** guidance.

6. **Hard refresh browser** after upgrade (`Ctrl+F5` / clear cache)—views are heavily cached.

If **version** on the module form never increases vs Git `__manifest__.py`, the running server is **not** using this repository path or branch—fix **Odoo.sh project → Git submodule / addons path** first.

## 3) Configure API token

Set Odoo system parameter:

- `lakecity_loan.api_token=<strong_random_secret>`

This token is required by all `/lakecity/api/v1/*` endpoints.

## 4) Network/security

- Keep Odoo.sh URL in Supabase Vault as `odoo_url_<tenant_id>`.
- Keep API token in Supabase Vault as `odoo_loan_api_token_<tenant_id>`.
- Use HTTPS only.

## 5) Bulk import from Supabase (go-live migration)

Historical **contracts** become `lakecity.loan.contract` rows; **`external_uid`** is the Supabase `contracts.id`.  
Approved **`payment_receipts`** (`qc_status = 'approved'`) are posted as **`lakecity.loan.payment`** with **`external_uid`** = receipt `id` (idempotent reruns).

In this repo root (with `@supabase/supabase-js` already in `package.json`):

1. Append to `.env` (do **not** commit the service role key):

   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` — service role bypasses RLS for a one-off admin migration  
   - `ODOO_ORIGIN` — production base URL, no trailing slash, e.g. `https://<project>.odoo.com`
   - `LAKECITY_LOAN_API_TOKEN` — exact match to Odoo parameter `lakecity_loan.api_token`

   Optional: `TENANT_SLUG=lakecity` (default); `SKIP_PREFLIGHT=1` skips Odoo `GET /health` (not recommended); `MIGRATE_ODOO_RETRIES` (default `4`) for transient 429/502/503. Finish partial runs despite row errors: `MIGRATE_CONTINUE_ON_ERROR=1`.

2. Connectivity check (recommended): **`pnpm run migrate:odoo-bnpl:preflight`** (`--preflight-only`).

3. Dry run (logs only): **`pnpm run migrate:odoo-bnpl:dry-run`** or `DRY_RUN=1`.

4. Back up Odoo DB (Odoo.sh backup), then **`pnpm run migrate:odoo-bnpl`** (or `npm run …`).

CLI flags mirror env: **`--dry-run`**, **`--preflight-only`**, **`--skip-preflight`**.

**Balances:** Odoo derives **`current_balance`** from **total − deposit − posted payments**. Supabase **`contract_balances`** is informational; reconcile a few stands after import. **`monthly_installment`** in Supabase may differ slightly from **`recurring_invoice_amount`** due to VAT/rounding formulas in Odoo.

**Collection Schedule CSV → BNPL:** See `docs/odoo-crm-accounting-bnpl-pipeline.md` and `scripts/import-collection-schedule-csv-to-odoo.mjs` (opening totals from **TOTAL PAID** / **Current Balance**).
