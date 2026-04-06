#!/usr/bin/env bash
# Edge Functions against local Supabase — run after test:env:setup (second terminal)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "Start Docker first, then: npm run test:env:setup"
  exit 1
fi

ENV_FILE="$ROOT/supabase/.functions-test.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — run: npm run test:env:setup"
  exit 1
fi

echo "Serving all functions from supabase/functions (Ctrl+C to stop)..."
exec npx supabase functions serve --env-file "$ENV_FILE"
