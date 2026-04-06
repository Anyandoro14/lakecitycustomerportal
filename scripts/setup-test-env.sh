#!/usr/bin/env bash
# Local test stack: Docker + Supabase CLI + env files. Run: npm run test:env:setup
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo ""
  echo "  Docker is not running (or not installed)."
  echo "  1) Install Docker Desktop for Mac: https://docs.docker.com/desktop/"
  echo "  2) Start Docker, wait until it is \"running\""
  echo "  3) Run again:  npm run test:env:setup"
  echo ""
  exit 1
fi

echo "==> Starting local Supabase (applies supabase/migrations/)..."
npx supabase start

# Default local API + JWTs (Supabase CLI local stack — not production secrets)
# If you change ports in supabase/config.toml, update these URLs/keys from: npx supabase status
VITE_FILE="$ROOT/.env.test.local"
FUNC_ENV="$ROOT/supabase/.functions-test.env"

echo "==> Writing $VITE_FILE (for Vite: npm run dev:test)"
cat > "$VITE_FILE" << 'EOF'
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
VITE_DEFAULT_TENANT_SLUG=lakecity
EOF

echo "==> Writing $FUNC_ENV (for Edge Functions: npm run test:env:serve-functions)"
cat > "$FUNC_ENV" << 'EOF'
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
EOF

echo ""
echo "  Done."
echo "  Terminal 1:  npm run dev:test"
echo "  Terminal 2:  npm run test:env:serve-functions   (needed for fetch-customer-data, etc.)"
echo ""
echo "  Verify:       npx supabase status"
echo "  Reset DB:     npx supabase db reset   (wipes local data, reapplies migrations)"
echo ""
