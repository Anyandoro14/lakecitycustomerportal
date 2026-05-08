# Deploy all Odoo-side code (Odoo.sh)

This is the operator checklist to get **every custom addon** onto **production Odoo** on Odoo.sh.

## 0. Canonical repo: **Standledger**

**Odoo.sh builds from `Anyandoro14/Standledger` only.** Treat that as the **single source of truth for what runs in Odoo**.

| Repo | Role |
|------|------|
| **`Standledger`** | Custom addons under `odoo/addons/<module>/`, branches **`Staging`** / **`main`**. All Odoo.sh merges and CONNECT URLs come from here. |
| **`lakecitycustomerportal`** | Customer portal, Supabase Edge Functions, migrations. **Not** deployed by Odoo.sh. If you author addon code here, you **copy/sync** `odoo/addons/*` into **Standledger** before merging to production. |

Custom addons must be **committed and pushed** on **Standledger** on the branch you promote (`Staging` → `main`).

### Syncing addons from the monorepo into Standledger

When `lakecitycustomerportal` has changes under `odoo/addons/`:

```bash
# Example: two clones side by side
RSYNC_SRC="/path/to/lakecitycustomerportal/odoo/addons/"
RSYNC_DST="/path/to/Standledger/odoo/addons/"

rsync -a --delete --exclude='.git' "$RSYNC_SRC" "$RSYNC_DST"
cd /path/to/Standledger
git status
git add odoo/addons
git commit -m "Sync custom addons from lakecitycustomerportal"
git push origin Staging    # or your working branch; then merge to main per §1
```

Adjust paths; use `--delete` only if you intend to mirror the monorepo exactly (it removes addon folders removed in source). For a single module: copy just that directory.

Then wait for Odoo.sh to rebuild **Standledger** `Staging`, test, and **merge `Staging` → `main`** (if Git reports differences — if “Nothing to merge”, branches already match).

## 1. Ship code to Odoo.sh’s production branch

**Option A — Odoo.sh UI (common)**  

1. Confirm **Staging** build is green and has the addons you expect.  
2. In the left sidebar, **drag the `Staging` branch onto `main`** (Production).  
3. If Odoo says **Nothing to merge**, `Staging` and `main` already point at the same commits — no Git diff; production build already matches. Otherwise confirm the merge and wait for **production** green.

**Option B — GitHub**  

1. Open a PR **`Staging` → `main`** on **Standledger**.  
2. Merge; Odoo.sh rebuilds **main**.

## 2. Install / upgrade every module in Odoo (production)

Code on disk ≠ installed app.

1. **Connect** to the **production** build (green **CONNECT**).  
2. **Apps** → **Update Apps List**.  
3. Search and **Install** or **Upgrade** each custom module, e.g.:

   - **Lakecity Loan Management** (folder `lakecity_loan_management`)  
   - **Lakecity CRM — Collection Schedule** (folder `lakecity_crm`) — *only if that module exists in the built repo*

4. **Accounting:** Use **Apps** to install or upgrade Odoo’s standard **Accounting** app if your business flow requires it (not replaced by custom addons).

## 3. Verify

- **Settings** → **Apps** → confirm each Lake City module shows **Installed**.  
- Smoke-test flows (one payment, one schedule line, REST/JSON-RPC if used).

## 4. Not included in “Odoo.sh deploy”

- **Customer portal, Edge Functions, Supabase** — deploy via **Lovable / `lakecitycustomerportal` `main`**, not Odoo branch drag.

---

**Reminder:** What Odoo runs is whatever is on **Standledger** at merge time. Addons that exist only in `lakecitycustomerportal` do **not** deploy until you **sync** them into **Standledger** (§0).
