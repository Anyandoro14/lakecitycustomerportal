#!/usr/bin/env bash
# Odoo.sh SSH helper — read server logs when the web “Logs” UI is empty or unhelpful.
# Official layout: https://www.odoo.com/documentation/master/administration/odoo_sh/advanced/containers.html
#
# Typical files:
#   ~/logs/odoo.log    — running server (HTTP, cron, most tracebacks while serving)
#   ~/logs/update.log  — module install/update (-i/-u), XML/RNG failures often land HERE
#   ~/logs/install.log — DB provisioning
#   ~/logs/pip.log     — pip on build
#
# Where to run:
#   • Odoo.sh SSH (path after your repo is under src/user — Standledger, etc.):
#       bash ~/src/user/odoo/addons/lakecity_loan_management/scripts/odoo_sh_logs.sh errors
#   • Laptop clone of this repo (optional):
#       bash scripts/odoo_sh_logs.sh errors
#
# `npm run logs:gh` does not run on Odoo.sh (no package.json in ~).
#
# Commands:
#   …/odoo_sh_logs.sh errors   # START HERE — ERROR / Traceback lines
#   …/odoo_sh_logs.sh all      # last lines from odoo + update + install + pip
#   …/odoo_sh_logs.sh diag     # sizes, mtimes, odoo.conf log hints
#   …/odoo_sh_logs.sh show     # tail odoo.log (or newest non-empty log)
#   …/odoo_sh_logs.sh tail     # tail -f odoo.log
#   …/odoo_sh_logs.sh ls       # list ~/logs
#
# zsh: do not type ~120 — tilde+digits is a named directory in zsh.

set -u
set -o pipefail

LOGDIR="${HOME}/logs"
MODE="${1:-errors}"
TAIL_LINES="${TAIL_LINES:-120}"
ERROR_LINES="${ERROR_LINES:-80}"

known_logs() {
	for f in odoo.log update.log install.log pip.log; do
		[[ -f "${LOGDIR}/${f}" ]] && echo "${LOGDIR}/${f}"
	done
}

newest_nonempty_log() {
	find "${LOGDIR}" -maxdepth 3 -type f -name '*.log' -size +0 -printf '%T@\t%p\n' 2>/dev/null |
		sort -rn |
		head -1 |
		cut -f2-
}

primary_log() {
	local p
	for p in "${LOGDIR}/odoo.log" "${LOGDIR}/update.log"; do
		if [[ -f "$p" ]]; then
			echo "$p"
			return 0
		fi
	done
	newest_nonempty_log || true
}

grep_errors_in_file() {
	local file="$1"
	[[ -f "$file" ]] || return 0
	# Odoo log lines often start with timestamp; tracebacks span multiple lines — show matches + context
	if command -v rg >/dev/null 2>&1; then
		rg -n --color never -i -e 'ERROR' -e 'Traceback' -e 'CRITICAL' -e 'ParseError' \
			-e 'ValidationError' -e 'except_' -e 'AssertionError' -e 'KeyError' \
			-e 'XMLSyntaxError' -e 'RelaxNG' -e 'odoo\.tools\.convert\.ParseError' "$file" 2>/dev/null |
			tail -n "$ERROR_LINES" || true
	else
		grep -n -i -E 'ERROR|Traceback|CRITICAL|ParseError|ValidationError|RelaxNG|XMLSyntaxError|AssertionError|KeyError|except_' "$file" 2>/dev/null |
			tail -n "$ERROR_LINES" || true
	fi
}

case "$MODE" in
errors)
	if [[ ! -d "$LOGDIR" ]]; then
		echo "No directory: $LOGDIR (are you on Odoo.sh shell in the running build container?)" >&2
		exit 1
	fi
	found_any=""
	for f in $(known_logs); do
		out="$(grep_errors_in_file "$f")"
		if [[ -n "$out" ]]; then
			found_any=1
			echo ""
			echo "──── Matches in $f ────"
			echo "$out"
		fi
	done
	if [[ -z "$found_any" ]]; then
		echo "No ERROR/Traceback-style lines in odoo.log / update.log / install.log / pip.log." >&2
		echo "Try:  bash $0 diag    and    bash $0 all" >&2
		echo "If files are 0 bytes, logging may go only to the platform collector — open a ticket with Odoo.sh or trigger an action and retry." >&2
	fi
	;;
all)
	if [[ ! -d "$LOGDIR" ]]; then
		echo "No directory: $LOGDIR" >&2
		exit 1
	fi
	for base in odoo.log update.log install.log pip.log; do
		p="${LOGDIR}/${base}"
		[[ -f "$p" ]] || continue
		lines="$(wc -l <"$p" | tr -d ' ')"
		bytes="$(wc -c <"$p" | tr -d ' ')"
		echo ""
		echo "════════ $p ($lines lines, $bytes bytes) ════════"
		tail -n "$TAIL_LINES" "$p"
	done
	;;
diag)
	echo "User: $(whoami)  Host: $(hostname)"
	echo "Log dir: $LOGDIR"
	ls -la "$LOGDIR" 2>/dev/null || echo "(cannot list $LOGDIR)"
	echo ""
	for base in odoo.log update.log install.log pip.log; do
		p="${LOGDIR}/${base}"
		if [[ -f "$p" ]]; then
			stat "$p" 2>/dev/null || ls -l "$p"
			wc -l "$p"
		else
			echo "(missing $p)"
		fi
	done
	echo ""
	echo "── Odoo-related processes (if any) ──"
	(ps aux 2>/dev/null | grep -E '[o]doo-bin|[o]doo\.py' || true)
	echo ""
	conf="${HOME}/.config/odoo/odoo.conf"
	if [[ -f "$conf" ]]; then
		echo "── $conf (non-comment lines mentioning log) ──"
		grep -v '^[[:space:]]*#' "$conf" | grep -i log || echo "(no log* keys or file unreadable)"
	else
		echo "(no $conf)"
	fi
	;;
ls)
	echo "Log directory: $LOGDIR"
	ls -la "$LOGDIR" 2>/dev/null || echo "(no $LOGDIR)"
	echo ""
	echo "Other *.log under $LOGDIR (newest first):"
	find "$LOGDIR" -maxdepth 5 -type f -name '*.log' -printf '%T@\t%p\n' 2>/dev/null |
		sort -rn |
		head -40 |
		cut -f2- ||
		true
	;;
tail)
	log="${LOGDIR}/odoo.log"
	if [[ ! -f "$log" ]]; then
		log="$(primary_log || true)"
	fi
	if [[ -z "$log" || ! -f "$log" ]]; then
		echo "No odoo.log found under $LOGDIR. Run: bash $0 diag" >&2
		exit 1
	fi
	echo "Tailing: $log (Ctrl+C to stop)" >&2
	tail -f "$log"
	;;
show)
	log="$(primary_log || true)"
	if [[ -z "$log" || ! -f "$log" ]]; then
		echo "No log files under $LOGDIR. Run: bash $0 diag" >&2
		exit 1
	fi
	echo "File: $log (last $TAIL_LINES lines)"
	echo "---"
	tail -n "$TAIL_LINES" "$log"
	;;
*)
	echo "Usage: bash $0 [errors|all|diag|show|tail|ls]" >&2
	echo "Default command is: errors" >&2
	exit 1
	;;
esac
