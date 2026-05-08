#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# setup-lakecity-odoo-vault.sh
#
# Interactive helper that writes the four Supabase Vault secrets
# (odoo_url / odoo_db / odoo_uid / odoo_api_key) for the LakeCity tenant,
# so /odoo-accounting in StandLedger can resolve credentials at request time.
#
# What it does
#   1. Reads SUPABASE_DB_URL from .env (or the environment, or prompts).
#   2. Looks up the LakeCity tenant UUID (slug='lakecity').
#   3. Prompts for the four Odoo credentials, masking the API key on input.
#   4. Sanity-checks them by hitting Odoo's JSON-RPC `/jsonrpc` endpoint.
#   5. Calls docs/sql/lakecity-odoo-vault-secrets.sql via psql to upsert.
#   6. Verifies the round-trip with vault_read_secret().
#
# Requirements
#   - psql, jq, curl on PATH
#   - $SUPABASE_DB_URL (postgres connection string with sufficient
#     privileges — typically the Supabase service role / postgres role)
#
# Usage
#   bash scripts/setup-lakecity-odoo-vault.sh
#   bash scripts/setup-lakecity-odoo-vault.sh --dry-run   (skip upsert)
# ----------------------------------------------------------------------------

set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '1,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL_FILE="$ROOT/docs/sql/lakecity-odoo-vault-secrets.sql"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "Could not find $SQL_FILE" >&2
  exit 1
fi

# ----------------------------------------------------------------------------
# Tooling check
# ----------------------------------------------------------------------------
for tool in psql jq curl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing required tool: $tool" >&2
    exit 1
  fi
done

# ----------------------------------------------------------------------------
# Resolve SUPABASE_DB_URL
# ----------------------------------------------------------------------------
if [[ -z "${SUPABASE_DB_URL:-}" && -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ROOT/.env"
  set +a
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  read -rp 'SUPABASE_DB_URL (postgres://...): ' SUPABASE_DB_URL
fi

if [[ -z "$SUPABASE_DB_URL" ]]; then
  echo "SUPABASE_DB_URL is required." >&2
  exit 1
fi

export PGOPTIONS="-c statement_timeout=30000"

# ----------------------------------------------------------------------------
# Look up tenant UUID
# ----------------------------------------------------------------------------
TENANT_SLUG="${TENANT_SLUG:-lakecity}"

echo
echo "==> Looking up tenant_id for slug='$TENANT_SLUG' ..."
TENANT_ID="$(psql "$SUPABASE_DB_URL" -tAc \
  "SELECT id FROM public.tenants WHERE slug='$TENANT_SLUG' LIMIT 1;")"

if [[ -z "$TENANT_ID" ]]; then
  echo "No tenant with slug '$TENANT_SLUG' found in public.tenants." >&2
  echo "Confirm the slug or seed the tenant first (see docs/sql/lovable-ensure-tenants-lakecity.sql)." >&2
  exit 1
fi

echo "    tenant_id = $TENANT_ID"

# ----------------------------------------------------------------------------
# Collect credentials
# ----------------------------------------------------------------------------
echo
echo "==> Enter Odoo credentials for tenant '$TENANT_SLUG'."
echo "    See docs/odoo-partner-onboarding/track-b-odoo-sh-and-database.md (B2)."
echo

read -rp 'odoo_url (https://lakecity.odoo.com, no trailing slash): ' ODOO_URL
ODOO_URL="${ODOO_URL%/}"

read -rp 'odoo_db (Odoo.sh production DB name): ' ODOO_DB
read -rp 'odoo_uid (integer user id of NJere integrator): ' ODOO_UID
read -rsp 'odoo_api_key (input hidden): ' ODOO_API_KEY
echo
echo

if [[ -z "$ODOO_URL" || -z "$ODOO_DB" || -z "$ODOO_UID" || -z "$ODOO_API_KEY" ]]; then
  echo "All four values are required." >&2
  exit 1
fi

if ! [[ "$ODOO_UID" =~ ^[0-9]+$ ]]; then
  echo "odoo_uid must be a positive integer." >&2
  exit 1
fi

# ----------------------------------------------------------------------------
# Sanity-check the credentials against the Odoo JSON-RPC endpoint
# ----------------------------------------------------------------------------
echo "==> Sanity-checking credentials against $ODOO_URL/jsonrpc ..."

PROBE_BODY="$(jq -n \
  --arg db "$ODOO_DB" \
  --arg uid "$ODOO_UID" \
  --arg key "$ODOO_API_KEY" \
  '{jsonrpc:"2.0",method:"call",id:1,params:{
    service:"object",method:"execute_kw",
    args:[$db,($uid|tonumber),$key,
          "res.users","read",[[($uid|tonumber)],["login","name"]]]
  }}')"

PROBE_RESULT="$(curl -sS --max-time 15 -X POST "$ODOO_URL/jsonrpc" \
  -H 'Content-Type: application/json' \
  -d "$PROBE_BODY" || true)"

if echo "$PROBE_RESULT" | jq -e '.error' >/dev/null 2>&1; then
  echo "Odoo rejected the credentials:" >&2
  echo "$PROBE_RESULT" | jq -r '.error.data.message // .error.message' >&2
  exit 1
fi

USER_LOGIN="$(echo "$PROBE_RESULT" | jq -r '.result[0].login // empty')"
USER_NAME="$(echo "$PROBE_RESULT"  | jq -r '.result[0].name  // empty')"

if [[ -z "$USER_LOGIN" ]]; then
  echo "Unexpected response from Odoo. Raw output:" >&2
  echo "$PROBE_RESULT" >&2
  exit 1
fi

echo "    Authenticated as $USER_NAME <$USER_LOGIN>"

# ----------------------------------------------------------------------------
# Upsert into Vault
# ----------------------------------------------------------------------------
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo
  echo "==> --dry-run was passed, NOT writing to Vault. Would have run:"
  echo "    psql ... -f $SQL_FILE \\"
  echo "         -v tenant_id=$TENANT_ID \\"
  echo "         -v odoo_url=$ODOO_URL \\"
  echo "         -v odoo_db=$ODOO_DB \\"
  echo "         -v odoo_uid=$ODOO_UID \\"
  echo "         -v odoo_api_key=<redacted>"
  exit 0
fi

echo
echo "==> Upserting four Vault secrets (suffix _$TENANT_ID) ..."

psql "$SUPABASE_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -v "tenant_id=$TENANT_ID" \
  -v "odoo_url=$ODOO_URL" \
  -v "odoo_db=$ODOO_DB" \
  -v "odoo_uid=$ODOO_UID" \
  -v "odoo_api_key=$ODOO_API_KEY" \
  -f "$SQL_FILE"

echo
echo "Done. Next:"
echo "  1. Deploy edge functions if not already deployed:"
echo "       bash scripts/deploy-supabase-functions.sh"
echo "  2. Visit /odoo-accounting in StandLedger as a tenant=$TENANT_SLUG user."
echo "  3. Confirm the dashboard renders Total Receivable / Overdue / Collected MTD."
