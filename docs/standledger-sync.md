# Standledger ↔ lakecitycustomerportal sync

Odoo.sh builds from **[Anyandoro14/Standledger](https://github.com/Anyandoro14/Standledger)**. Day-to-day development lives in **lakecitycustomerportal** (portal + Supabase + Odoo addons). Only `odoo/addons/` is mirrored to Standledger.

## Standard workflow (automated)

1. Commit and push **lakecitycustomerportal** `main` (or `staging`).
2. If `odoo/addons/**` changed, GitHub Actions runs **Sync Odoo addons to Standledger**.
3. Standledger receives the same commit content → **Odoo.sh rebuilds** (main or Staging).

### One-time setup (GitHub Actions)

1. GitHub → **Anyandoro14/lakecitycustomerportal** → **Settings** → **Secrets and variables** → **Actions**
2. Add secret **`STANDLEGER_SYNC_TOKEN`**:
   - Fine-grained personal access token
   - Repository access: **Standledger** only
   - Permissions: **Contents** → Read and write
3. Push any change under `odoo/addons/` to verify the workflow in **Actions**.

### Local sync (same logic as CI)

```bash
# Uses ../Standledger if present, else temp clone
npm run sync:standledger

# Or with token (no local Standledger clone needed)
STANDLEGER_SYNC_TOKEN=ghp_xxx npm run sync:standledger
```

Push portal + sync in one step:

```bash
npm run deploy:odoo
```

Branch mapping:

| lakecitycustomerportal | Standledger (Odoo.sh) |
|------------------------|------------------------|
| `main` | `main` |
| `staging` | `Staging` |

## Alternative: one repo (no sync)

`lakecitycustomerportal` already has `odoo/addons/` in the same layout as Standledger. You can point **Odoo.sh** at **lakecitycustomerportal** instead of Standledger so every `git push` rebuilds Odoo immediately with no mirror step.

Trade-off: Odoo.sh sees the full monorepo (portal, Supabase, xlsx files). Standledger stays a slim Odoo-only repo.

## What is not synced

- Portal app (`src/`, `supabase/`, etc.)
- Root spreadsheets and scripts (except what lives under `odoo/addons/.../scripts`)

Only the three addons are copied:

- `lakecity_branding`
- `lakecity_docutils_patch`
- `lakecity_loan_management`
