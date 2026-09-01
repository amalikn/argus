#!/opt/homebrew/bin/bash
# Run every quality gate the repo exposes and record the result of each one, including the ones that fail.
#
# This exists so "the baseline" is a reproducible artifact rather than a claim. It never stops on first failure: a gate that fails is a
# recorded fact, not an error in the run. Exit status is the count of failed gates, so CI can gate on it later while a human run still
# sees the whole picture.
#
# Logs land under tools-runtime (rebuildable), never in the repo. npm cache is routed to tools-working-cache for the same reason.
#
# Usage: scripts/baseline-gates.sh [--skip-package]

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="/Volumes/Data/_ai/_tool/tools-runtime/argus"
CACHE_DIR="/Volumes/Data/_ai/_tool/tools-working-cache/argus"
LOG_DIR="$RUNTIME_DIR/logs"
MISE="${MISE:-/opt/homebrew/bin/mise}"
SKIP_PACKAGE=0

[ "${1:-}" = "--skip-package" ] && SKIP_PACKAGE=1

mkdir -p "$LOG_DIR" "$CACHE_DIR/npm-cache"
export npm_config_cache="$CACHE_DIR/npm-cache"
cd "$REPO_ROOT" || exit 2

STAMP="$(date +%Y%m%d_%H%M)"
REPORT="$LOG_DIR/baseline-gates-$STAMP.txt"
FAILED=0

run_gate() {
  local name="$1"; shift
  local log="$LOG_DIR/gate-${name//:/-}.log"
  printf '%-16s ' "$name"
  if "$@" >"$log" 2>&1; then
    printf 'PASS\n'
    printf '%-16s PASS  %s\n' "$name" "$log" >>"$REPORT"
  else
    local code=$?
    printf 'FAIL (exit %d)\n' "$code"
    printf '%-16s FAIL(exit %d)  %s\n' "$name" "$code" "$log" >>"$REPORT"
    FAILED=$((FAILED + 1))
  fi
}

{
  echo "argus baseline gates"
  echo "timestamp: $(date -Iseconds)"
  echo "repo:      $REPO_ROOT"
  echo "commit:    $(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "branch:    $(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "node:      $($MISE exec -- node --version 2>/dev/null || echo missing)"
  echo "npm:       $($MISE exec -- npm --version 2>/dev/null || echo missing)"
  echo
} | tee "$REPORT"

run_gate "install" "$MISE" exec -- npm ci
run_gate "lint" "$MISE" exec -- npm run lint
run_gate "compile" "$MISE" exec -- npm run compile
run_gate "build:webview" "$MISE" exec -- npm run build:webview
run_gate "test" "$MISE" exec -- npm test

if [ "$SKIP_PACKAGE" -eq 0 ]; then
  run_gate "package" "$MISE" exec -- npx --yes @vscode/vsce package --out "$RUNTIME_DIR/argus-$STAMP.vsix"
fi

echo
echo "failed gates: $FAILED"
echo "report:       $REPORT"
printf '\nfailed gates: %d\n' "$FAILED" >>"$REPORT"

exit "$FAILED"
