#!/usr/bin/env bash
# Deploy mcp + fetch-google-sheets to the hosted project in supabase/config.toml.
# Requires SUPABASE_ACCESS_TOKEN (supabase login or env).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REF="$(grep '^project_id' "$ROOT/supabase/config.toml" | head -1 | sed 's/project_id = "\(.*\)"/\1/')"
if [[ -z "$REF" ]]; then
  echo "Could not read project_id from supabase/config.toml" >&2
  exit 1
fi
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN is not set. Create a token at https://supabase.com/dashboard/account/tokens and export it." >&2
  exit 1
fi
cd "$ROOT"
echo "Bundling StandLedger MCP..."
npm run build:mcp
echo "Deploying mcp and fetch-google-sheets to $REF"
npx supabase functions deploy mcp --project-ref "$REF" --use-api
npx supabase functions deploy fetch-google-sheets --project-ref "$REF" --use-api
echo "Deployed."
