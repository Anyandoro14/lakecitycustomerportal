#!/usr/bin/env bash
# Sync odoo/addons from lakecitycustomerportal → Anyandoro14/Standledger (Odoo.sh Git source).
#
# Usage:
#   npm run sync:standledger
#   STANDLEGER_SYNC_TOKEN=ghp_xxx npm run sync:standledger   # required for HTTPS push without local creds
#
# Branch mapping: main → main, staging → Staging (Odoo.sh naming).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STANDLEGER_REPO="${STANDLEGER_REPO:-https://github.com/Anyandoro14/Standledger.git}"
ADDONS=(lakecity_branding lakecity_docutils_patch lakecity_loan_management)
PORTAL_BRANCH="$(git branch --show-current)"

case "$PORTAL_BRANCH" in
  main) STANDLEGER_BRANCH="main" ;;
  staging) STANDLEGER_BRANCH="Staging" ;;
  *)
    echo "WARN: branch '$PORTAL_BRANCH' → pushing to Standledger main (map staging explicitly if needed)."
    STANDLEGER_BRANCH="main"
    ;;
esac

WORK_DIR="${STANDLEGER_CLONE_DIR:-}"
if [[ -z "$WORK_DIR" ]]; then
  if [[ -d "$ROOT/../Standledger/.git" ]]; then
    WORK_DIR="$ROOT/../Standledger"
  else
    WORK_DIR="$(mktemp -d)"
    trap 'rm -rf "$WORK_DIR"' EXIT
  fi
fi

clone_url() {
  if [[ -n "${STANDLEGER_SYNC_TOKEN:-}" ]]; then
    echo "https://x-access-token:${STANDLEGER_SYNC_TOKEN}@github.com/Anyandoro14/Standledger.git"
  else
    echo "$STANDLEGER_REPO"
  fi
}

if [[ ! -d "$WORK_DIR/.git" ]]; then
  echo "== Clone Standledger → $WORK_DIR"
  git clone "$(clone_url)" "$WORK_DIR"
fi

cd "$WORK_DIR"
git fetch origin
if git show-ref --verify --quiet "refs/remotes/origin/$STANDLEGER_BRANCH"; then
  git checkout -B "$STANDLEGER_BRANCH" "origin/$STANDLEGER_BRANCH"
else
  git checkout -B "$STANDLEGER_BRANCH"
fi

echo "== Rsync odoo/addons (portal → Standledger)"
for addon in "${ADDONS[@]}"; do
  src="$ROOT/odoo/addons/$addon"
  dst="$WORK_DIR/odoo/addons/$addon"
  if [[ ! -d "$src" ]]; then
    echo "SKIP missing addon: $addon"
    continue
  fi
  mkdir -p "$dst"
  rsync -a --delete \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.DS_Store' \
    "$src/" "$dst/"
  echo "  synced $addon"
done

git add odoo/addons/
if git diff --staged --quiet; then
  echo "== Standledger already up to date (no commit)"
  exit 0
fi

PORTAL_SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
git commit -m "sync(odoo): addons from lakecitycustomerportal@${PORTAL_SHA}"

echo "== Push origin/$STANDLEGER_BRANCH"
if [[ -n "${STANDLEGER_SYNC_TOKEN:-}" ]]; then
  git push "https://x-access-token:${STANDLEGER_SYNC_TOKEN}@github.com/Anyandoro14/Standledger.git" "HEAD:refs/heads/$STANDLEGER_BRANCH"
else
  git push origin "HEAD:refs/heads/$STANDLEGER_BRANCH"
fi

echo "Done. Odoo.sh should start a new build on Standledger / $STANDLEGER_BRANCH shortly."
