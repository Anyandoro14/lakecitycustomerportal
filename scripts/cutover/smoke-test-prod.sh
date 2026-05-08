#!/usr/bin/env bash
# smoke-test-prod.sh
#
# Quick post-deploy sanity for the Odoo CRM cutover. Hits each in-scope edge
# function and reports PASS/FAIL. Does NOT modify any data.
#
# Required env vars:
#   SUPABASE_URL          e.g. https://<project>.supabase.co
#   SUPABASE_ANON_KEY     publishable key (apikey header)
#   PORTAL_JWT            access token for an internal/admin user
#                         (curl POST /auth/v1/token with email+password to get)
#
# Usage:
#   export SUPABASE_URL=...
#   export SUPABASE_ANON_KEY=...
#   export PORTAL_JWT=...
#   bash scripts/cutover/smoke-test-prod.sh

set -uo pipefail

ENDPOINT_BASE="${SUPABASE_URL:?Set SUPABASE_URL}/functions/v1"
APIKEY="${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY}"
JWT="${PORTAL_JWT:?Set PORTAL_JWT (admin/internal user token)}"

GREEN=$'\033[0;32m'
RED=$'\033[0;31m'
YELLOW=$'\033[0;33m'
RESET=$'\033[0m'

PASS=0
FAIL=0

run_check() {
  local name="$1"
  local fn="$2"
  local body="$3"
  local jq_filter="$4"
  local expected="$5"

  printf "  %-30s ... " "$name"
  local response
  response=$(curl -sS --max-time 15 -X POST \
    -H "Authorization: Bearer ${JWT}" \
    -H "apikey: ${APIKEY}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${ENDPOINT_BASE}/${fn}" 2>&1)
  local actual
  actual=$(echo "$response" | jq -r "$jq_filter" 2>/dev/null)

  if [[ "$actual" == "$expected" ]]; then
    echo "${GREEN}PASS${RESET}"
    PASS=$((PASS + 1))
  else
    echo "${RED}FAIL${RESET}"
    echo "    expected: $expected"
    echo "    actual:   $actual"
    echo "    response: $(echo "$response" | head -c 400)"
    FAIL=$((FAIL + 1))
  fi
}

echo "Odoo CRM cutover smoke test"
echo "  endpoint: $ENDPOINT_BASE"
echo

run_check "odoo-accounting-data ping" \
  "odoo-accounting-data" \
  '{"action":"ping"}' \
  '.ok' \
  'true'

run_check "odoo-audit-data feed" \
  "odoo-audit-data" \
  '{}' \
  '.ok' \
  'true'

# Pull recent counts for context (non-asserting)
echo
echo "  Recent activity (informational):"
audit=$(curl -sS --max-time 15 -X POST \
  -H "Authorization: Bearer ${JWT}" \
  -H "apikey: ${APIKEY}" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "${ENDPOINT_BASE}/odoo-audit-data" 2>/dev/null)

echo "$audit" | jq -r '
  if .ok then
    "    receipts_created_last_24h:    " + (.counts.receipts_created_last_24h | tostring),
    "    odoo_payments_paid_last_24h:  " + (.counts.odoo_payments_paid_last_24h | tostring),
    "    variance_last_24h:            " + (.counts.variance_last_24h | tostring),
    "    pending_qc:                   " + (.counts.pending_qc | tostring),
    "    drift_sample_size:            " + (.drift_sample | length | tostring),
    "    recent_syncs_count:           " + (.recent_syncs | length | tostring)
  else
    "    (audit feed returned an error: " + (.error // "unknown") + ")"
  end
' 2>/dev/null

echo
echo "Result: ${PASS} passed, ${FAIL} failed."
if [[ "$FAIL" -gt 0 ]]; then
  echo "${RED}Smoke test FAILED.${RESET} Review function logs in Lovable Cloud before proceeding."
  exit 1
fi
echo "${GREEN}Smoke test PASSED.${RESET}"
exit 0
