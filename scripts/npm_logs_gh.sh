#!/usr/bin/env bash
# Wrapper so `npm run logs:gh` fails fast with a clear message when run outside the repo
# (e.g. Odoo.sh SSH under /home/odoo, where there is no package.json).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f package.json ]]; then
	cat >&2 <<'EOF'
This npm script must be run from the lakecitycustomerportal repo root (directory
that contains package.json), on your dev machine:

  cd /path/to/lakecitycustomerportal
  npm run logs:gh --
  npm run logs:gh -- --repo Anyandoro14/Standledger --branch Staging

(`npm` reads ./package.json in the current working directory before running anything.)

On Odoo.sh SSH there is usually no Node project in ~ — do not use npm there.
For Odoo server logs on Odoo.sh:

  bash scripts/odoo_sh_logs.sh

(copy the repo or copy scripts/odoo_sh_logs.sh onto the server first).

GitHub Actions: install `gh` and run scripts/check_logs.sh from a clone.
EOF
	exit 1
fi

exec bash "$ROOT/scripts/check_logs.sh" "$@"
