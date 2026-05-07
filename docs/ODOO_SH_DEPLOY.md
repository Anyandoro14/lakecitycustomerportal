# Deploying `lakecity_crm` to Odoo.sh + Lovable Cloud

This runbook covers everything specific to **Odoo.sh** for the
`odoo/addons/lakecity_crm` module **and** the Lovable Cloud backend that
talks to it.

> **Two platforms, one git push.** Pushing to a connected branch deploys
> the addon to Odoo.sh **and** the Supabase migration + edge function to
> Lovable Cloud at the same time. Production safety therefore depends on
> branch mapping in *both* control panels — see Section 4.

---

## 1. Repository layout

Odoo.sh recursively scans the project branch for any directory containing
an `__manifest__.py` and treats it as an addon. Our layout:

```
<repo root>
├── odoo/
│   └── addons/
│       └── lakecity_crm/      ← the module
│           ├── __manifest__.py
│           ├── requirements.txt   (auto-installed by Odoo.sh)
│           └── ...
└── (rest of the customer portal: React, Supabase, docs)
```

You have two equally valid options for Odoo.sh:

### Option A — point Odoo.sh at this monorepo (simplest)

Push this repo to GitHub/GitLab and connect the project to Odoo.sh. Because
`__pycache__`, `node_modules`, `dist/` are all gitignored, the build is
clean. The React/Supabase code is harmless to Odoo.sh — it just gets
ignored.

**Pros:** one source of truth.
**Cons:** unrelated commits trigger Odoo.sh builds (the platform throttles
this, but staging databases will rebuild).

### Option B — dedicated Odoo addons repo (recommended for production)

Create a second repo `lakecity-odoo-addons` containing only:

```
lakecity-odoo-addons/
└── lakecity_crm/
    └── (full addon contents, moved up from odoo/addons/)
```

This is the canonical Odoo.sh pattern. Use git subtree or a periodic sync
script to keep it in step with this monorepo.

```bash
git subtree split --prefix=odoo/addons/lakecity_crm -b lakecity-odoo-addons
git push git@github.com:<org>/lakecity-odoo-addons.git lakecity-odoo-addons:main
```

---

## 2. Python dependencies

Odoo.sh **automatically runs `pip install -r requirements.txt`** for any
addon that declares one. We ship:

```
# odoo/addons/lakecity_crm/requirements.txt
openpyxl>=3.1.2
```

So the bulk-import wizard works out of the box on every staging and
production database — no manual pip install needed.

The manifest's `external_dependencies` block doubles as a guard:

```python
"external_dependencies": {
    "python": ["openpyxl"],
},
```

If `openpyxl` is somehow missing at runtime, install fails fast with a
clear error instead of failing on first wizard use.

---

## 3. Odoo version

This addon **targets Odoo 19**. The manifest version follows Odoo.sh's
required convention `<odoo_major>.<x>.<y>.<z>`:

```python
"version": "19.0.1.0.0"
```

Bump the **last three numbers** for module changes; never touch the
leading `19.0` unless migrating to a different Odoo major version. If
your Odoo.sh project is on 18, the addon still works (the conventions we
follow — `<list>` view tag, `<chatter/>` element, `<t t-name="card">`
kanban template — are all 18+); just change the leading `19.0` to `18.0`.

### Odoo 19 conformance checklist (audited)

| Topic | This addon |
|---|---|
| `<tree>` view tag | ❌ not used → replaced with `<list>` |
| `view_mode="tree,..."` | ❌ not used → replaced with `list,...` |
| `<div class="oe_chatter">` | ❌ not used → replaced with `<chatter/>` |
| `t-name="kanban-box"` | ❌ not used → replaced with `<t t-name="card">` |
| `attrs="{...}"` (removed in 17) | ❌ not used → inline `invisible="..."` |
| `states="..."` attribute (removed) | ❌ not used |
| `name_get` (deprecated) | ❌ not used → `_compute_display_name` |
| `t-esc` (legacy) | ❌ not used → `t-out` |
| `@api.model_create_multi` | ✅ used |
| `mail.thread`, `mail.activity.mixin` | ✅ used |
| `<chatter/>` element | ✅ used |
| Multi-company rule `company_id in company_ids` | ✅ used |
| `paperformat_id="base.paperformat_us"` | ✅ used (still ships in 19 core) |
| Python 3.11+ compatible | ✅ |

---

## 4. Branches → environments (BOTH platforms)

Both Odoo.sh and Lovable Cloud auto-deploy on git push. Recommended
convention so you never accidentally hit production:

| Git branch | Odoo.sh stage | Lovable Cloud env | Purpose |
|---|---|---|---|
| `main` (or `master`) | **Production** | **Production** | Live customer-facing |
| `staging-uat` | **Staging** | **Preview / Staging** | Pre-prod UAT |
| `wip/*`, `feature/*`, `dev/*` | **Dev** (or unmapped) | **Preview** | Throwaway test envs |

### Verify before pushing — checklist

1. **Odoo.sh project → Branches**: confirm the branch you're pushing is
   either unmapped or mapped to a Dev/Staging stage (not Production).
2. **Lovable project → Settings → Branches**: confirm only `main` (or
   your designated production branch) is connected to your live
   environment.
3. Pushing a feature branch should produce a Lovable preview URL **not**
   the customer-facing domain.

When you push to a stage branch, Odoo.sh rebuilds and re-installs the
addon. To pick up Python dep changes (e.g. bumping `openpyxl`), force a
**full rebuild** from the Odoo.sh UI rather than a hot-reload.

---

## 5. First install on a fresh Odoo.sh database

1. Connect the repo to your Odoo.sh project.
2. On the first build, switch to **Apps**, click **Update Apps List**.
3. Search **Lakecity** and click **Install**.
4. Optional: load demo data on a non-production stage to seed the
   sample Stand `24000`.

---

## 6. Migrating live data

In production, after install:

1. **Lakecity → Configuration → Import from XLSX**
2. Upload each of the nine
   `docs/payment-schedule-templates/Payment Schedules - Customer Portal/Collection_Schedule_Template_*.xlsx`
   files.
3. Re-running the same file is safe (idempotent — matches by Stand
   Number).

---

## 7. Wiring Lovable Cloud → Odoo.sh

> **Lovable Cloud auto-deploys on git push.** This project's backend lives
> on **Lovable Cloud**, which is a Supabase-compatible managed backend.
> The migration file in `supabase/migrations/` and the edge function in
> `supabase/functions/odoo-push-schedule/` deploy **automatically** when
> the branch is pushed — there is no `supabase db push` or
> `supabase functions deploy` step.

### What ships on `git push`

| File path | What Lovable Cloud does |
|---|---|
| `supabase/migrations/20260506230000_contracts_odoo_schedule_id.sql` | Runs once against the connected Postgres on next deploy. Adds the `contracts.odoo_schedule_id` column and index. |
| `supabase/functions/odoo-push-schedule/index.ts` | Built and deployed as a Deno Edge Function. Becomes available at `https://<project>.lovable.app/functions/v1/odoo-push-schedule` (or the Supabase URL that Lovable surfaces in the project settings). |
| `supabase/migrations/...` (other agent's migrations) | Same — applied on next deploy. |

### One-time setup the auto-deploy can NOT do for you

You still need to populate four Vault secrets (per Lakecity tenant) so
the edge function can talk to Odoo.sh:

  - `odoo_url_<tenant_id>`     → e.g. `https://lakecity.odoo.com`
  - `odoo_db_<tenant_id>`      → real Odoo.sh DB name (e.g.
    `lakecity-production-NNNNN`, **not** the slug `lakecity`).
    Visible in the Odoo.sh project → Settings panel.
  - `odoo_uid_<tenant_id>`     → numeric Odoo user id of the integrator
    user (often `7` for admin or higher for a dedicated integrator).
  - `odoo_api_key_<tenant_id>` → API key generated in Odoo
    (incognito → log in as that user → enable 2FA → Preferences →
    Account Security → New API Key)

`<tenant_id>` is the **UUID** from `public.tenants WHERE slug='lakecity'`,
**not** the slug. Use the SQL helper checked in at
`docs/sql/lakecity-odoo-vault-secrets.sql` (or the wrapper script
`scripts/setup-lakecity-odoo-vault.sh`) — it's idempotent and read-back
verifies all four secrets after writing.

```bash
# Recommended: run via the wrapper which prompts for values.
bash scripts/setup-lakecity-odoo-vault.sh
```

The wrapper resolves the tenant UUID, calls `vault.create_secret`/
`vault.update_secret` for each of the four keys, and prints a verification
table at the end (the API key is masked). Re-runs are safe — values get
upserted in place.

### Test the wired-up function (no UI side effects)

The edge function only runs when something invokes it. To test against
the staging tenant without disturbing the production customer UI:

```bash
# Replace <project>, <user_jwt>, <contract_id> with your values.
curl -X POST "https://<project>.supabase.co/functions/v1/odoo-push-schedule" \
  -H "Authorization: Bearer <user_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"contract_id":"<contract-uuid>"}'
```

A successful response is `{"status":"ok","action":"created","odoo_schedule_id":<int>}`.
If the Vault secrets are missing it returns
`{"error":"Missing Vault secret: odoo_api_key_<tenant_id>"}` — that's the
signal to run the vault setup script above.

---

## 8. Optional: incoming Odoo → Lovable Cloud webhook for schedules

The existing `supabase/functions/odoo-webhook` (which Lovable Cloud
already auto-deploys with the rest of the project) routes `res.partner`,
`sale.order`, `account.payment`, and `account.move`. To have changes
made *inside Odoo* on a `lakecity.collection.schedule` flow back, add a
server action in Odoo that POSTs to that endpoint. The webhook shared
secret is already loaded from Lovable Cloud's Vault per tenant.

A minimal Odoo automation example (Settings → Technical → Automation
Rules) on `lakecity.collection.schedule`:

- **Trigger:** On Save
- **Action:** Server Action → Execute Python Code
- **Code:**
  ```python
  import json, urllib.request
  for rec in records:
      payload = {
          "_model": "lakecity.collection.schedule",
          "_id": rec.id,
          "stand_number": rec.stand_number,
          "total_price": rec.total_price,
          "current_balance": rec.current_balance,
          "state": rec.state,
      }
      req = urllib.request.Request(
          "https://<project>.supabase.co/functions/v1/odoo-webhook",
          data=json.dumps(payload).encode(),
          headers={
              "Authorization": "Bearer <webhook-secret-from-Vault>",
              "Content-Type": "application/json",
          },
      )
      try:
          urllib.request.urlopen(req, timeout=5)
      except Exception as exc:
          _logger.warning("schedule webhook failed: %s", exc)
  ```

(You'll need to add a `lakecity.collection.schedule` branch in
`supabase/functions/odoo-webhook/index.ts` — once committed, Lovable
Cloud picks it up on the next push.)

---

## 9. Gotchas

- **Don't depend on `sale_management`** — keeping `lakecity_crm`
  dependency-light (`base`, `mail`, `contacts`) means the addon installs
  on a stripped-down Odoo.sh project without surprises.
- **Day-5 constraint** is strict. When importing legacy data with
  off-cycle start dates, the wizard will reject the row with a clear
  message; either fix the source row or relax the
  `_check_start_date_is_5th` constraint locally before importing.
- **Multi-company:** record rules already filter
  `lakecity.collection.schedule` by `company_id`. If your Odoo.sh
  tenancy uses one company per Lakecity location, no further changes
  are needed.
- **Backups:** Odoo.sh runs nightly backups automatically. Before each
  bulk import on production, take an on-demand backup from the Odoo.sh
  UI (Branches → Production → Backups → Take Backup).
- **wkhtmltopdf** for the QWeb PDF report is preinstalled on Odoo.sh —
  no extra system packages needed.
