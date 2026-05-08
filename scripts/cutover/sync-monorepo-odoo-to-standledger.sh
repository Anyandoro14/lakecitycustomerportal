#!/usr/bin/env bash
# sync-monorepo-odoo-to-standledger.sh
#
# Copies odoo/addons from this repo into a local Standledger clone and pushes Staging.
# After push: Odoo.sh rebuilds Staging; merge Staging -> main in UI or push main from here.
#
# Usage:
#   export STANDLEDGER_DIR=~/dev/Standledger   # or leave default below
#   bash scripts/cutover/sync-monorepo-odoo-to-standledger.sh
#
# First-time:  git clone https://github.com/Anyandoro14/Standledger.git ~/dev/Standledger

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STANDLEDGER_DIR="${STANDLEDGER_DIR:-$HOME/Standledger-sync}"
ADDONS_SRC="$ROOT/odoo/addons"
ADDONS_DST="$STANDLEDGER_DIR/odoo/addons"

if [[ ! -d "$ADDONS_SRC" ]]; then
  echo "No $ADDONS_SRC — nothing to sync." >&2
  exit 1
fi
if [[ ! -d "$STANDLEDGER_DIR/.git" ]]; then
  echo "Standledger clone not found: $STANDLEDGER_DIR" >&2
  echo "  git clone https://github.com/Anyandoro14/Standledger.git $STANDLEDGER_DIR" >&2
  exit 1
fi

mkdir -p "$ADDONS_DST"
rsync -a --delete "$ADDONS_SRC/" "$ADDONS_DST/"
find "$ADDONS_DST" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

cd "$STANDLEDGER_DIR"
git checkout Staging
git add odoo/addons .gitignore 2>/dev/null || git add odoo/addons
if git diff --staged --quiet; then
  echo "No changes after rsync."
  exit 0
fi
git commit -m "Sync odoo/addons from lakecitycustomerportal"
git push origin Staging
echo "Pushed origin/Staging. In Odoo.sh: wait for green build, then merge Staging -> main if needed."
