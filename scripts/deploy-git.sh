#!/usr/bin/env bash
# Push this repo to GitHub so connected services pick up changes:
#   - Lovable Cloud (frontend — deploy/trigger from the Lovable dashboard as usual)
#   - Odoo.sh / Standledger (custom addons synced from Git)
#
# This project does not run Supabase here; omit db/functions unless you add them back.
#
# Usage: npm run deploy:git
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="$(git branch --show-current)"
echo "== Git push → origin/$BRANCH"
git push origin "$BRANCH"

echo ""
echo "Done. Use Lovable Cloud for app hosting/deploy; Odoo addons still flow via Standledger/Git when you sync them."
