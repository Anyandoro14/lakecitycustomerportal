#!/usr/bin/env bash
# prepare-release-branch.sh
#
# Creates a clean release branch off origin/main containing ONLY the in-scope
# commits for the Odoo CRM cutover. The script does NOT push anything - it
# leaves the branch ready for you to review with `git log` and `git diff`,
# then push with `git push origin release/odoo-cutover` when you're satisfied.
#
# In-scope commits:
#   6d6c1b4  Add lakecity_crm Odoo 19 module + Odoo.sh deployment wiring
#   3f7a36c  Add odoo-accounting-data edge function (read-only, no UI route yet)
#   c99810f  docs: rewrite Odoo.sh runbook for Lovable Cloud auto-deploy
#
# Out-of-scope commits (deliberately NOT cherry-picked):
#   09d9368  WIP: local v2 stubs, docs, and scripts  (BNPL v2 + payment orchestration)
#   uncommitted local working-tree changes (App.tsx route, OdooAccounting.tsx, etc.)
#
# After this script completes, also commit the cutover artifacts created by
# this plan implementation (docs/cutover/*, scripts/cutover/*, the upcoming
# code changes for reverse sync, audit page, etc.) onto the same branch.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

BRANCH="release/odoo-cutover"
COMMITS=(
  "6d6c1b4"   # lakecity_crm + odoo-push-schedule + migration
  "3f7a36c"   # odoo-accounting-data edge function
  "c99810f"   # ODOO_SH_DEPLOY.md rewrite
)

# 1. Refuse to run with dirty working tree (avoids accidental inclusions)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Working tree is dirty. Stash or commit changes first:" >&2
  echo "  git stash push -u -m 'pre-release-prep'" >&2
  exit 1
fi

# 2. Refuse to run if branch already exists locally
if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  echo "ERROR: Branch $BRANCH already exists locally." >&2
  echo "  Delete it first with:  git branch -D $BRANCH" >&2
  echo "  Or pick a different branch name." >&2
  exit 1
fi

echo "==> Fetching origin/main"
git fetch origin main

echo "==> Creating $BRANCH from origin/main"
git checkout -b "$BRANCH" origin/main

echo "==> Cherry-picking in-scope commits"
for sha in "${COMMITS[@]}"; do
  echo "    cherry-pick $sha"
  if ! git cherry-pick --allow-empty "$sha"; then
    echo
    echo "Cherry-pick of $sha conflicted. Resolve, then either:"
    echo "  git cherry-pick --continue   # finish this commit"
    echo "  git cherry-pick --abort      # bail out"
    echo
    exit 1
  fi
done

echo
echo "==> Branch $BRANCH ready. Files added on top of origin/main:"
git diff --stat origin/main..."$BRANCH" | tail -40

echo
echo "==> Next steps:"
echo "  1. Add the cutover artifacts:"
echo "       git add docs/cutover/ scripts/cutover/ .env.staging.example"
echo "       git commit -m 'Add Odoo cutover runbooks and helper scripts'"
echo
echo "  2. Add any reverse-sync / audit-page code changes (see plan steps 6-8)."
echo
echo "  3. Review the diff:"
echo "       git log --oneline origin/main..$BRANCH"
echo "       git diff origin/main..$BRANCH | less"
echo
echo "  4. When satisfied, push and open a PR (or merge directly):"
echo "       git push origin $BRANCH"
echo "       gh pr create --base main --head $BRANCH --title 'Odoo CRM cutover'"
echo
echo "  Lovable Cloud will auto-deploy edge functions and apply migrations"
echo "  ONCE THE BRANCH IS MERGED INTO main. The release branch on its own"
echo "  does not affect production."
