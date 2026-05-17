#!/usr/bin/env bash
# Deploy backends tied to this repo, excluding Lovable Cloud app hosting:
#   1) git push → GitHub (Odoo.sh / Standledger sync addons from repo)
#   2) supabase db push → linked remote (requires `supabase link` once per machine)
#   3) supabase functions deploy → project ref from supabase/config.toml
#
# Prerequisites:
#   supabase login
#   supabase link --project-ref <ref> --password '<postgres_password>'
#
# Usage: npm run deploy:non-lovable   OR   bash scripts/deploy-non-lovable.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REF="$(grep '^project_id' "$ROOT/supabase/config.toml" | head -1 | sed 's/project_id = "\(.*\)"/\1/')"
if [[ -z "$REF" ]]; then
  echo "Could not read project_id from supabase/config.toml" >&2
  exit 1
fi

BRANCH="$(git branch --show-current)"

echo "== [1/3] Git push → origin/$BRANCH"
git push origin "$BRANCH"

echo "== [2/3] Supabase database migrations (linked project)"
if ! supabase db push --linked --yes; then
  echo "" >&2
  echo "db push failed. Link once (Dashboard → Project Settings → Database password):" >&2
  echo "  supabase login" >&2
  echo "  supabase link --project-ref \"$REF\" --password '<DATABASE_PASSWORD>'" >&2
  exit 1
fi

echo "== [3/3] Supabase Edge Functions → ref $REF"
bash "$ROOT/scripts/deploy-supabase-functions.sh"

echo ""
echo "deploy:non-lovable finished (Lovable frontend unchanged). Odoo.sh: pull/build → Apps → Upgrade addons."
