#!/usr/bin/env bash
# Install openpyxl into a local venv (gitignored) and run the template fixer.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
VENV="$ROOT/.venv-xlsx"
if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install -q -r "$ROOT/requirements-xlsx.txt"
exec "$VENV/bin/python" "$ROOT/fix_collection_schedule_templates.py"
