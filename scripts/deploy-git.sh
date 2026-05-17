#!/usr/bin/env bash
# Push this repo to GitHub — primary workflow when hosting on Lovable Cloud only:
#   - Lovable Cloud builds/deploys the app from your connected Git repo (see Lovable dashboard).
#   - If you also sync this repo to Odoo.sh / Standledger, custom addons update from the same push.
#
# Usage: npm run deploy   OR   npm run deploy:git
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="$(git branch --show-current)"
echo "== Git push → origin/$BRANCH"
git push origin "$BRANCH"

echo ""
echo "Done. Trigger or verify deploy in Lovable Cloud; Odoo addons follow Git only if you link that repo."
