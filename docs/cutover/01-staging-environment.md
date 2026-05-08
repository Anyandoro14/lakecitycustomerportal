# Staging Environment Setup

This runbook walks through creating an isolated staging environment so you can test the Odoo CRM cutover end-to-end without touching production customer data.

> **Time required**: ~45 minutes hands-on, plus ~30 minutes of waiting on builds.
>
> **Prerequisites**: Owner access on the Lovable Cloud project `Customer Portal`, owner access on Odoo.sh project `anyandoro14-standledger`.

## 0. Prefer `lakecitycustomerportal/staging`

For this cutover, **staging the portal and Supabase** should live on **`github.com/Anyandoro14/lakecitycustomerportal`**, branch **`staging`** — not on the Odoo.sh Git remote unless yours is wired to this same repo.

| Piece | Git / product | Purpose |
|---|---|---|
| **Portal + Supabase** | **`lakecitycustomerportal`** → **`staging`** | Remix Lovable staging (or GitHub-connected preview) tracks this branch. Edge functions, migrations, React, and **`odoo/addons/`** if you ship the addon from this monorepo. |
| **Odoo.sh runtime** | Often **`Standledger`** (separate repo) → branch **`Staging`** / **`main`** | Where Odoo 19 builds and runs — independent Git history unless you unify repos. |

**What to push where:** Push cutover-testing commits to **`origin/staging`** on **`lakecitycustomerportal`**. Keep **`main`** for production Lovable until you merge. Align `staging` with current `main` before heavy testing:

```bash
git fetch origin
git checkout main && git pull --rebase origin main   # or merge if you prefer
git checkout staging
git merge main    # or: git reset --hard main && git push --force-with-lease origin staging
git push -u origin staging
```

Odoo.sh may still show **Clone** URLs for **`Standledger`** — that only affects **where Odoo rebuilds**; your **staging Supabase** still talks to Odoo via **Vault** (staging Odoo URL + DB name), regardless of which Git repo you use for the portal.

## 1. Remix the Lovable Cloud project

1. Open Lovable Cloud at <https://lovable.dev> and select the **Customer Portal** project.
2. Click the project name (top-left) → **Remix**.
3. Name the new project: `Customer Portal — Odoo Staging`.
4. Region: pick the same region as production for parity.
5. Click **Create** and wait for provisioning (~3–5 min).

What this gives you:
- A fresh Supabase backend with the **same schema** (tables, RLS, edge functions structure) but **no data** and **no Vault secrets**.
- A separate Lovable Cloud workspace with its own SUPABASE_URL and anon key.
- Functions are copied as code (you can deploy/edit independently).

## 2. Create a separate Odoo.sh staging branch

Production lives on the `main` branch of `anyandoro14-standledger`. We'll add a `staging` development branch with its own database.

1. Open Odoo.sh: <https://www.odoo.sh> → project `anyandoro14-standledger`.
2. In the left sidebar, under **Staging**, use the mini form (shown when you expand or add staging):
   - **Fork** — this *is* the source branch picker (Odoo.sh does **not** label it “Source”). Choose **`main`** to fork production’s code/database snapshot into staging.
   - **To** — the **name** of the new Git branch (e.g. `staging`). Do **not** leave a generic placeholder; use a valid branch name.
3. **Create it:** Many Odoo.sh layouts **do not show** a labelled **Submit** / **Create** row under **Fork** / **To**. Try in order:
   - Click inside **To**, then press **Enter** — that often submits the fork inline.
   - Look for a small **✓**, arrow, or **Fork** icon **to the right of the “To” box** or on the **Staging** header row (easy to miss in dark mode — hover the area).
   - Widen the browser window or zoom out — the confirm control can sit just outside the visible sidebar width.
   - Top bar → **Branches** → look for **Fork**, **New branch**, or equivalent on the branch list (same operation, clearer UI).

   **Git workaround** (always works): create and push the branch yourself, then assign it to **Staging** in Odoo.sh:

   ```bash
   git clone <your-odoo-sh-repo-ssh-url> && cd <repo>
   git fetch origin && git checkout main && git pull
   git checkout -b staging    # lowercase branch names avoid odd UI edge cases
   git push -u origin staging
   ```

   Odoo.sh will detect `staging`, usually under **Development** first. In the left sidebar, **drag** the `staging` branch from **Development** into the **Staging** section (official flow: *drag and drop* under the target stage).

If your UI looks like “Fork `main`” and “To: …”, that is exactly “branch from production” (`main`): there is no separate “Source” field.

4. Wait for the staging build to complete (~10 min).

5. Click **Connect** on the staging branch — note the URL pattern:

   ```
   https://anyandoro14-standledger-staging-<NNNN>.dev.odoo.com
   ```

   where `<NNNN>` is the build number. This will rebuild on each push.
6. The staging DB name is the full subdomain (without `https://`) — copy it for Vault setup in § 4 below.

## 3. Get the staging Lovable Cloud connection details

In the new staging Lovable Cloud project:

1. Settings → API.
2. Copy:
   - `SUPABASE_URL` → e.g. `https://xxxx-staging.supabase.co`
   - `anon` (publishable) key
   - `service_role` key (keep secret)
3. Open `.env.staging.local` in your editor and write these in (a template is provided in [.env.staging.example](.env.staging.example)).

## 4. Wire Vault secrets in the staging Lovable Cloud

In the staging project's SQL Editor, run:

```sql
-- Resolve the staging tenant UUID first (or insert one if remix didn't carry tenants over)
select id, slug from public.tenants where slug = 'lakecity';
-- If empty, insert a tenant row with the same slug:
-- insert into public.tenants (slug, display_name) values ('lakecity', 'Lake City (Staging)') returning id;

-- Use the UUID from above (replace <UUID>):
select vault.create_secret('https://anyandoro14-standledger-staging-NNNN.dev.odoo.com', 'odoo_url_<UUID>');
select vault.create_secret('anyandoro14-standledger-staging-NNNN',                       'odoo_db_<UUID>');
select vault.create_secret('<staging_user_uid>',                                          'odoo_uid_<UUID>');
select vault.create_secret('<staging_api_key>',                                           'odoo_api_key_<UUID>');
select vault.create_secret('<random_64_char_bearer>',                                     'odoo_webhook_secret_<UUID>');
```

Generate the bearer with: `openssl rand -hex 32` in your terminal.

The staging Odoo user and API key are separate from production — generate them inside the staging Odoo branch (Settings → Users → New `Customer Portal API (Staging)` → Accountant role → set password → 2FA → API Key).

## 5. Seed sanitized customer data into staging

Production has real customer rows in Supabase. To test realistically without leaking PII:

```bash
# From your laptop, with PROD_DB_URL pointing at production Supabase
pg_dump "$PROD_DB_URL" \
  --schema=public \
  --data-only \
  --table=tenants \
  --table=profiles \
  --table=contracts \
  --table=installments \
  --table=payment_receipts \
  --table=contract_balances \
  > /tmp/lake-city-prod-snapshot.sql
```

Then sanitize before importing:

```bash
# Replace real names/emails with synthetic ones
sed -i.bak \
  -e "s/\\b[A-Z][a-z]\\+ [A-Z][a-z]\\+\\b/Test Customer/g" \
  -e "s/[a-z0-9._%+-]\\+@[a-z0-9.-]\\+\\.[a-z]\\{2,\\}/test+%@example.com/g" \
  /tmp/lake-city-prod-snapshot.sql
```

Restore into staging via the staging Lovable Cloud SQL editor (paste the file contents) or:

```bash
psql "$STAGING_DB_URL" < /tmp/lake-city-prod-snapshot.sql
```

Limit row counts for faster iteration — only import 5–10 stands' worth:

```sql
-- After import, trim to 10 stands:
delete from public.payment_receipts where stand_number not in (
  select stand_number from public.profiles order by created_at desc limit 10
);
delete from public.installments where contract_id not in (
  select id from public.contracts where stand_number in (
    select stand_number from public.profiles order by created_at desc limit 10
  )
);
delete from public.contracts where stand_number not in (
  select stand_number from public.profiles order by created_at desc limit 10
);
delete from public.profiles where stand_number not in (
  select stand_number from public.profiles order by created_at desc limit 10
);
```

## 6. Verify isolation

Before any cutover code lands, verify the two environments are completely separate:

```bash
# Set both URLs as env vars
export PROD_URL="https://prod.lovable.app"
export STAGING_URL="https://staging.lovable.app"

# Hit each healthcheck-style endpoint and confirm they return different data
curl -sS "$PROD_URL/" | grep -i "tenant" || echo "no tenant info shown"
curl -sS "$STAGING_URL/" | grep -i "tenant"
```

Sanity checks:
- Different SUPABASE_URLs in each project.
- Different Odoo URLs in Vault.
- Different Kuva webhook destinations (don't let production Kuva fire into staging).
- A test transaction in staging Odoo does NOT appear in production Supabase.
- A test transaction in production stays out of staging Supabase.

## 7. Reconfigure Kuva (or any payment provider) in staging Odoo only

Critical: the production Kuva webhook posts to the production Lovable Cloud edge function URL. In staging Odoo, point Kuva (and any other provider) to the **staging** Lovable Cloud edge function URL instead. Don't reuse production webhook secrets.

For testing without real money: use Kuva's sandbox/test mode if available, or stub the provider entirely.

## 8. Branch this repo for cutover work

**Deploy path:** cutover work lands on **`staging`** on `lakecitycustomerportal` first (Lovable staging / preview), then merges to **`main`** for production once green.

For a long-lived review branch you can still use a feature branch and merge it into `staging` when ready:

```bash
git fetch origin
git checkout staging
git merge origin/main          # keep staging current with main, or rebase your feature onto staging
git checkout -b feature/odoo-cutover   # optional: branch off staging for a PR
```

When ready to publish to the **staging Lovable** deployment, push **`staging`** (after merge/review). When ready for **production**, merge `staging` → `main` (or open a PR `staging` → `main`).

If you still use `wip/local-v2-and-docs` for unrelated v2 work, keep that separate; do not mix BNPL deploys into `staging`/`main` per the cutover plan.

## 9. Done. You now have

- Two Lovable Cloud projects (production + staging) with separate Supabase backends.
- Two Odoo branches (production + staging) with separate databases.
- Sanitized data in staging.
- Vault secrets in staging pointing at staging Odoo.
- **`lakecitycustomerportal/staging`** as the integration branch for staging deploys; **`main`** for production when you promote.

Proceed to [02-preflight.md](02-preflight.md).
