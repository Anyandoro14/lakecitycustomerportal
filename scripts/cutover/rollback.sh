#!/usr/bin/env bash
# rollback.sh
#
# Cutover rollback: revert the cutover PR on main, post the rollback message,
# and remind the operator to disable Odoo automation rules manually.
#
# Idempotent: safe to re-run.
#
# Usage:
#   bash scripts/cutover/rollback.sh

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "==> Rolling back the Odoo CRM cutover."
echo

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not installed. Install it before running rollback." >&2
  exit 1
fi

read -rp "Are you sure you want to revert the cutover on main? [type 'rollback' to proceed]: " confirm
if [[ "$confirm" != "rollback" ]]; then
  echo "Aborted."
  exit 1
fi

CUTOVER_SHA="$(git log origin/main --oneline -n 50 \
  --grep='Odoo CRM cutover' \
  --grep='lakecity_crm' \
  --max-count=1 \
  --format='%H' \
  | head -n 1)"

if [[ -z "$CUTOVER_SHA" ]]; then
  echo "Could not auto-detect the cutover commit on origin/main." >&2
  echo "Find the merge commit manually with: git log origin/main --oneline | head -n 20" >&2
  read -rp "Paste the cutover merge commit SHA: " CUTOVER_SHA
fi

if [[ -z "$CUTOVER_SHA" ]]; then
  echo "No SHA provided. Aborting." >&2
  exit 1
fi

echo "  reverting commit $CUTOVER_SHA"
git fetch origin main
git checkout main
git pull --rebase origin main

if git revert --no-edit "$CUTOVER_SHA"; then
  git push origin main
  echo "  revert pushed to main; Lovable Cloud will redeploy the previous state."
else
  echo "Revert failed - resolve conflicts manually, then commit and push." >&2
  exit 1
fi

cat <<EOF

==> Manual follow-up required (cannot be done from this script):

  1. In production Odoo:
     Settings → Technical → Automation Rules
     Set BOTH 'Sync Lakecity Payment to Supabase' and
     'Sync Lakecity Schedule to Supabase' to INACTIVE.

  2. Re-enable spreadsheet edit access:
     Open the Collection Schedule spreadsheet → File → Share → restore
     the previous edit permissions for the internal team.

  3. Post the rollback message in #lakecity-ops:
     "Cutover ROLLED BACK. Internal team: please resume using the
     Collection Schedule spreadsheet. The customer portal continues
     to function normally — no customer impact. We will investigate
     and reschedule."

  4. Mark the cutover log entry "ROLLED BACK" with timestamp + reason.

==> Investigation:

  - Lovable Cloud function logs for odoo-webhook, odoo-sync-payment,
    odoo-audit-data over the cutover window.
  - Sample failing receipt rows:
    SELECT * FROM payment_receipts
    WHERE odoo_sync_status NOT IN ('synced','pending')
    ORDER BY created_at DESC LIMIT 20;
  - Odoo logs: Settings → Technical → Logging → filter by lakecity_crm.

EOF
