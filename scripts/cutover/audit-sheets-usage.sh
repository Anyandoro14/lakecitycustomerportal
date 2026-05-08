#!/usr/bin/env bash
# audit-sheets-usage.sh
#
# Lists every file in supabase/functions/ and src/ that calls the Google Sheets API
# or imports the shared collection-schedule helpers. Run before cutover to confirm
# the inventory in docs/cutover/02-preflight.md matches reality.
#
# Usage: bash scripts/cutover/audit-sheets-usage.sh

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PATTERN_API='sheets\.spreadsheets|getSheetsClient|GOOGLE_SERVICE_ACCOUNT|googleapis\.com'
PATTERN_HELPER='_shared/collection-schedule-sheets'
PATTERN_INVOKE='fetch-google-sheets'
PATTERN_LIB='@/lib/collection-schedule|COLLECTION_SCHEDULE_TAB'

echo "== Edge functions calling Google Sheets API =="
echo
grep -rElI --include='*.ts' "$PATTERN_API" supabase/functions/ 2>/dev/null \
  | sort -u | sed 's|^|  |'

echo
echo "== Edge functions importing _shared/collection-schedule-sheets =="
echo
grep -rElI --include='*.ts' "$PATTERN_HELPER" supabase/functions/ 2>/dev/null \
  | sort -u | sed 's|^|  |'

echo
echo "== Frontend files invoking fetch-google-sheets =="
echo
grep -rElI --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' "$PATTERN_INVOKE" src/ 2>/dev/null \
  | sort -u | sed 's|^|  |'

echo
echo "== Frontend files referencing collection-schedule helpers =="
echo
grep -rElI --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' "$PATTERN_LIB" src/ 2>/dev/null \
  | sort -u | sed 's|^|  |'

echo
echo "Done. Compare against the expected list in docs/cutover/02-preflight.md."
