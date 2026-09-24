#!/usr/bin/env bash
# List and tail GitHub Actions / workflow logs (needs `gh` + auth).
#
# RUN LOCATION: your dev machine inside this repo — NOT on Odoo.sh SSH (no package.json
# there; use scripts/odoo_sh_logs.sh on Odoo.sh for server logs).
#
# Odoo.sh *build* history is in the Odoo.sh UI; this script only queries GitHub Actions
# via `gh run` when your repo has workflows. Repos without workflows print “no runs found”.
#
# Usage:
#   ./scripts/check_logs.sh list [--branch BRANCH] [--limit N]
#   ./scripts/check_logs.sh log [RUN_ID]              # full log (latest if no id)
#   ./scripts/check_logs.sh failed [--branch BRANCH]   # log-failed for latest failed run
#   ./scripts/check_logs.sh watch RUN_ID               # stream until run completes
#   ./scripts/check_logs.sh errors [RUN_ID]            # grep ERROR / Traceback from latest/full log
#
# Options (before subcommand):
#   --repo OWNER/NAME   use another repo (default: git remote origin)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPO=""
LIMIT=15
BRANCH=""

usage() {
	sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
	exit "${1:-0}"
}

while [[ $# -gt 0 && "$1" == -* ]]; do
	case "$1" in
	--repo)
		REPO="$2"
		shift 2
		;;
	--limit)
		LIMIT="$2"
		shift 2
		;;
	--branch)
		BRANCH="$2"
		shift 2
		;;
	-h | --help)
		usage 0
		;;
	*)
		echo "Unknown option: $1" >&2
		usage 1
		;;
	esac
done

# NOTE: With `set -u`, "${arr[@]}" on an empty array errors on some Bash versions;
# use "${arr[@]+"${arr[@]}"}" so zero gh flags expands to nothing safely.
GH_ARGS=()
[[ -n "$REPO" ]] && GH_ARGS+=(--repo "$REPO")

if ! command -v gh >/dev/null 2>&1; then
	echo "Install GitHub CLI: https://cli.github.com/  (brew install gh)" >&2
	exit 1
fi

SUB="${1:-list}"
shift || true

branch_args=()
[[ -n "$BRANCH" ]] && branch_args+=(--branch "$BRANCH")

case "$SUB" in
list)
	gh run list "${GH_ARGS[@]+"${GH_ARGS[@]}"}" "${branch_args[@]+"${branch_args[@]}"}" --limit "$LIMIT"
	;;
log)
	rid="${1:-}"
	if [[ -z "$rid" ]]; then
		rid="$(gh run list "${GH_ARGS[@]+"${GH_ARGS[@]}"}" "${branch_args[@]+"${branch_args[@]}"}" --limit 1 --json databaseId -q '.[0].databaseId')"
	fi
	if [[ -z "$rid" || "$rid" == null ]]; then
		echo "No workflow run found." >&2
		exit 1
	fi
	gh run view "$rid" "${GH_ARGS[@]+"${GH_ARGS[@]}"}" --log
	;;
failed)
	rid="$(gh run list "${GH_ARGS[@]+"${GH_ARGS[@]}"}" "${branch_args[@]+"${branch_args[@]}"}" --status failure --limit 1 --json databaseId -q '.[0].databaseId')"
	if [[ -z "$rid" || "$rid" == null ]]; then
		echo "No failed run found for this filter." >&2
		exit 1
	fi
	echo "Run ID: $rid" >&2
	gh run view "$rid" "${GH_ARGS[@]+"${GH_ARGS[@]}"}" --log-failed
	;;
watch)
	rid="${1:-}"
	if [[ -z "$rid" ]]; then
		echo "Usage: $0 watch RUN_ID" >&2
		exit 1
	fi
	gh run watch "$rid" "${GH_ARGS[@]+"${GH_ARGS[@]}"}"
	;;
errors)
	rid="${1:-}"
	if [[ -z "$rid" ]]; then
		rid="$(gh run list "${GH_ARGS[@]+"${GH_ARGS[@]}"}" "${branch_args[@]+"${branch_args[@]}"}" --limit 1 --json databaseId -q '.[0].databaseId')"
	fi
	if [[ -z "$rid" || "$rid" == null ]]; then
		echo "No workflow run found." >&2
		exit 1
	fi
	echo "Scanning run $rid for ERROR / Traceback / RelaxNG …" >&2
	if command -v rg >/dev/null 2>&1; then
		gh run view "$rid" "${GH_ARGS[@]+"${GH_ARGS[@]}"}" --log | rg -n -i 'error|traceback|relaxng|validation|exception|failed' || true
	else
		gh run view "$rid" "${GH_ARGS[@]+"${GH_ARGS[@]}"}" --log | grep -n -i -E 'error|traceback|relaxng|validation|exception|failed' || true
	fi
	;;
*)
	echo "Unknown command: $SUB" >&2
	usage 1
	;;
esac
