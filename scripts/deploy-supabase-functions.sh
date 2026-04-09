#!/usr/bin/env bash
# Deploy every Edge Function in supabase/functions to the remote project
# named in supabase/config.toml (project_id).
#
# Prerequisites: Supabase CLI installed; `supabase login` with an account
# that has deploy rights on that project.
#
# Usage: bash scripts/deploy-supabase-functions.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REF="$(grep '^project_id' "$ROOT/supabase/config.toml" | head -1 | sed 's/project_id = "\(.*\)"/\1/')"
if [[ -z "$REF" ]]; then
  echo "Could not read project_id from supabase/config.toml" >&2
  exit 1
fi
echo "Deploying all functions to project ref: $REF"
cd "$ROOT"
exec supabase functions deploy --project-ref "$REF" --use-api
