#!/usr/bin/env bash
# Push this repo to GitHub — primary workflow when hosting on Lovable Cloud only:
#   - Lovable Cloud builds/deploys the app from your connected Git repo (see Lovable dashboard).
#   - Odoo.sh builds Standledger: run npm run sync:standledger (or npm run deploy:odoo) after push,
#     or enable GitHub Action .github/workflows/sync-standledger.yml (see docs/standledger-sync.md).
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
