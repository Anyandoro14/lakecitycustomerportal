#!/usr/bin/env bash
# decommission-sheets.sh
#
# Removes the Sheet-only edge function entries from supabase/config.toml.
# Function code stays in the repo for the 30-60 day rollback window;
# only the routing is removed so Lovable Cloud stops invoking them.
#
# Migrating Sheet-read functions to DB-only is intentionally NOT automated
# - those edits are case-by-case and need review per function. See
# docs/cutover/11-decommission-sheets.md for the per-function checklist.
#
# Usage (only run after the 30-day clean window):
#   bash scripts/cutover/decommission-sheets.sh

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

CONFIG="supabase/config.toml"

# Refuse to run if working tree is dirty
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Working tree is dirty. Stash or commit changes first." >&2
  exit 1
fi

# Refuse to run if branch is not chore/decommission-sheets
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "chore/decommission-sheets" ]]; then
  echo "ERROR: Run this from the chore/decommission-sheets branch." >&2
  echo "  git checkout main && git pull && git checkout -b chore/decommission-sheets" >&2
  exit 1
fi

# Sheet-only edge functions to remove from routing
SHEET_ONLY=(
  "process-approved-receipts"
  "incoming-message-webhook"
  "backfill-registration-status"
  "rebuild-payments-from-sheet7"
  "scan-combined-deposits"
  "write-cell"
  "clear-cell"
  "fix-payment-cell"
)

echo "==> Removing Sheet-only function entries from $CONFIG"
for fn in "${SHEET_ONLY[@]}"; do
  if grep -q "^\[functions\.$fn\]" "$CONFIG"; then
    # Remove the [functions.<fn>] block (3 consecutive lines: header, verify_jwt, blank)
    awk -v target="[functions.$fn]" '
      $0 == target { skip = 3; next }
      skip > 0     { skip--; next }
      { print }
    ' "$CONFIG" > "$CONFIG.tmp" && mv "$CONFIG.tmp" "$CONFIG"
    echo "  removed [functions.$fn]"
  else
    echo "  [functions.$fn] not present, skipping"
  fi
done

echo
echo "==> $CONFIG diff:"
git diff -- "$CONFIG" | sed 's|^|  |'

cat <<EOF

==> Manual follow-up (per docs/cutover/11-decommission-sheets.md):

  1. Migrate Sheet-read edge functions to DB-only:
       - supabase/functions/lookup-stand-email/index.ts
       - supabase/functions/request-password-reset/index.ts
       - supabase/functions/internal-portal-access/index.ts
       - supabase/functions/manage-user-access/index.ts
       - supabase/functions/check-reporting-access/index.ts
       - supabase/functions/validate-signup/index.ts
       - supabase/functions/verify-signup-otp/index.ts
     Replace the Sheet branch with a profiles/internal_users SELECT.

  2. Delete supabase/functions/_shared/collection-schedule-sheets.ts
     (only after step 1 - confirm no remaining importers via grep).

  3. Manual: archive the Collection Schedule spreadsheet in Drive,
     and lock it to view-only.

  4. Manual: delete env vars GOOGLE_SERVICE_ACCOUNT_JSON,
     COLLECTION_SCHEDULE_SHEET_ID from Lovable Cloud function secrets.

  5. Manual: update docs and frontend pages that still reference the
     spreadsheet (DocsSheets.tsx, etc).

  6. Open the PR with: bash scripts/cutover/decommission-sheets.sh runbook.

EOF
