#!/usr/bin/env bash
# LakeCity Portal runs on Lovable Cloud. Edge Functions are deployed from
# Lovable chat after Git sync — not with `supabase functions deploy`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BRANCH="$(git branch --show-current)"
PROJECT="https://lovable.dev/projects/390f55c7-fa80-4e15-ad44-2a1d88871df8"

echo "Bundling StandLedger MCP..."
npm run build:mcp

echo "Pushing $BRANCH to GitHub so Lovable Git sync can pick it up..."
git push origin "$BRANCH"

cat <<EOF

This project uses Lovable Cloud, not a self-managed Supabase CLI login.

1. Merge this branch into the branch Lovable Git sync uses (usually main),
   or switch the Lovable project's active branch to: $BRANCH
2. Open $PROJECT
3. Paste this in Lovable chat (do not rewrite the functions from scratch):

Deploy the mcp and fetch-google-sheets edge functions from the GitHub source.
Use supabase/functions/mcp and supabase/functions/fetch-google-sheets as they
are in the repo. mcp accepts LOVABLE_API_KEY or a customer OAuth JWT.
fetch-google-sheets allows service-role Looking Glass when called by mcp.

4. Confirm in More → Cloud → Edge functions that mcp and fetch-google-sheets
   updated.

EOF
