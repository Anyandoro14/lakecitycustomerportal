#!/usr/bin/env bash
# run-daily-reconciliation.sh
#
# Runs docs/sql/cutover-monitoring.sql against production and emits a single
# PASS/FAIL summary suitable for a cron job or quick terminal check.
#
# Required env:
#   SUPABASE_DB_URL   postgres connection string (read-only role is sufficient)
#
# Optional env:
#   ALERT_WEBHOOK_URL Slack/Discord webhook to POST the summary to on FAIL.
#
# Usage:
#   bash scripts/cutover/run-daily-reconciliation.sh

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL}"

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is not installed."
  exit 1
fi

OUT_FILE="$(mktemp -t cutover-recon-XXXXXX.txt)"
trap 'rm -f "$OUT_FILE"' EXIT

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f docs/sql/cutover-monitoring.sql \
  > "$OUT_FILE" 2>&1
status=$?

if [[ "$status" -ne 0 ]]; then
  echo "FAIL: SQL execution errored. Output below."
  cat "$OUT_FILE"
  if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
    payload=$(jq -nR --arg t "$(cat "$OUT_FILE")" '{text:$t}')
    curl -sS -X POST -H 'Content-Type: application/json' \
      -d "$payload" "$ALERT_WEBHOOK_URL" >/dev/null
  fi
  exit 2
fi

stuck_pending="$(grep -A 1 "stuck in pending_qc" "$OUT_FILE" | tail -n 1 || true)"
no_match_pct="$(grep -E "^[[:space:]]+[0-9]+[[:space:]]+\|" "$OUT_FILE" | head -n 1 || true)"
duplicate_idemp="$(grep -A 2 "Webhook idempotency check" "$OUT_FILE" | tail -n 1 || true)"

echo "Cutover reconciliation summary @ $(date -u +'%Y-%m-%d %H:%M UTC')"
echo "  see full output:"
echo "  $OUT_FILE"
echo
echo "Headline checks:"
echo "  - Receipts in last 24h, sync status breakdown, no_match rate are above."
echo "  - Pending QC > 48h: review query 3 manually."
echo "  - Idempotency dupes: query 6 must return zero rows."
echo
echo "Open /internal/odoo-audit in the portal for the live dashboard view."

exit 0
