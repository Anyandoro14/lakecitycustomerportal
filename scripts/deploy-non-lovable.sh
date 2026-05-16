#!/usr/bin/env bash
# Deploy everything this repo drives outside Lovable:
#   1) git push → GitHub (Odoo.sh and others consume this repo)
#   2) Supabase DB migrations → linked remote (`supabase db push`)
#   3) Supabase Edge Functions → project ref from `supabase/config.toml`
#
# Prerequisites:
#   - supabase login   (account with Owner/Developer on the project)
#   - supabase link --project-ref <ref> --password '<postgres_password>'
#     (ref matches config.toml project_id; password from Dashboard → Database)
#
# Usage: bash scripts/deploy-non-lovable.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REF="$(grep '^project_id' "$ROOT/supabase/config.toml" | head -1 | sed 's/project_id = "\(.*\)"/\1/')"
if [[ -z "$REF" ]]; then
  echo "Could not read project_id from supabase/config.toml" >&2
  exit 1
fi

BRANCH="$(git branch --show-current)"
echo "== [1/3] Git push → origin/$BRANCH (Odoo.sh / CI)"
git push origin "$BRANCH"

echo "== [2/3] Supabase database migrations (linked project)"
if ! supabase db push --linked --yes; then
  echo "" >&2
  echo "db push failed. Link once with DB password:" >&2
  echo "  supabase login" >&2
  echo "  supabase link --project-ref \"$REF\" --password '<DATABASE_PASSWORD>'" >&2
  exit 1
fi

echo "== [3/3] Supabase Edge Functions → ref $REF"
bash "$ROOT/scripts/deploy-supabase-functions.sh"

echo ""
echo "Non-Lovable deploy finished."
echo "Odoo.sh: ensure this repo/branch is built → Apps → Upgrade lakecity_loan_management (and related addons)."
