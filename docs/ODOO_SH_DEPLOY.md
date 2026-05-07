# Deploying `lakecity_crm` to Odoo.sh

This runbook covers everything specific to **Odoo.sh** for the
`odoo/addons/lakecity_crm` module.

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

## 4. Branches → environments

Odoo.sh maps git branches to environments. Recommended convention:

| Branch | Stage on Odoo.sh | Purpose |
|---|---|---|
| `main` (or `master`) | **Production** | Live customer data |
| `staging-uat` | **Staging** | Pre-prod UAT (auto-rebased weekly) |
| `dev/*` | **Dev** | Throwaway test databases |

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

## 7. Wiring Supabase → Odoo.sh

The `supabase/functions/odoo-push-schedule` edge function pushes
`contracts` rows into `lakecity.collection.schedule` on Odoo.sh via
JSON-RPC. You need:

- **Per-tenant Vault secrets** (already used by `odoo-sync-payment`):
  - `odoo_url_<tenant_id>`     → e.g. `https://<your-org>.odoo.com`
  - `odoo_db_<tenant_id>`      → Odoo.sh DB name (visible in the
    Odoo.sh project → "Settings" panel)
  - `odoo_uid_<tenant_id>`     → numeric user ID (e.g. `2` for the
    integration user)
  - `odoo_api_key_<tenant_id>` → API key generated in Odoo from
    "Preferences → Account Security → New API Key"
- `tenants.crm_provider = 'odoo'` for the tenant
- Migration applied: `supabase/migrations/20260506230000_contracts_odoo_schedule_id.sql`

Deploy the function:

```bash
supabase functions deploy odoo-push-schedule
```

Test from the Supabase dashboard or with curl:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/odoo-push-schedule" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"contract_id":"<uuid>"}'
```

---

## 8. Optional: incoming Odoo → Supabase webhook for schedules

The existing `supabase/functions/odoo-webhook` already routes
`res.partner`, `sale.order`, `account.payment`, `account.move`. If you
want changes made *inside Odoo* on a schedule to flow back to Supabase,
add a server action in Odoo that POSTs to that webhook. The webhook
shared secret is already loaded from Vault per tenant.

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
`supabase/functions/odoo-webhook/index.ts` for that data to be
persisted.)

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
