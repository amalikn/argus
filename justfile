# Argus multi-agent fork — task runner.
#
# Every interpreter is resolved to an explicit path rather than inherited from PATH, so a recipe cannot silently run against the host
# Homebrew node or the system python. Node and npm come from the mise pin in .mise.toml; python comes from the routed venv under
# tools-working-cache. Run `just doctor` to see exactly what resolved.
#
# Rebuildable state stays out of the repo: npm cache in tools-working-cache, logs and VSIX output in tools-runtime.
#
# The shell is pinned too. just defaults to `sh -cu`, which on macOS is bash 3.2 in POSIX mode and silently ignores a failing command in
# the middle of a recipe. Pinning Homebrew bash 5 with -euo pipefail means a recipe stops at the first failure rather than reporting
# success from its last line, and a failure inside a pipe is not swallowed.

set shell := ["/opt/homebrew/bin/bash", "-euo", "pipefail", "-c"]

runtime := "/Volumes/Data/_ai/_tool/tools-runtime/argus"
cache   := "/Volumes/Data/_ai/_tool/tools-working-cache/argus"
mise    := "/opt/homebrew/bin/mise"
bash    := "/opt/homebrew/bin/bash"
venv    := cache / "venv"
python  := venv / "bin/python"

# Resolved at parse time from the mise pin, so a version bump in .mise.toml is picked up without editing this file.
node := `/opt/homebrew/bin/mise which node 2>/dev/null || echo node`
npm  := `/opt/homebrew/bin/mise which npm 2>/dev/null || echo npm`
npx  := `/opt/homebrew/bin/mise which npx 2>/dev/null || echo npx`

export npm_config_cache := cache / "npm-cache"

# List available recipes.
default:
    @just --list

# Show which interpreters and paths this justfile actually resolved to.
doctor:
    @echo "node   : {{node}}   ($({{node}} --version 2>/dev/null || echo MISSING))"
    @echo "npm    : {{npm}}    ($({{npm}} --version 2>/dev/null || echo MISSING))"
    @echo "python : {{python}} ($({{python}} --version 2>/dev/null || echo MISSING))"
    @echo "npm cache : ${npm_config_cache}"
    @echo "runtime   : {{runtime}}"
    @echo "venv      : {{venv}}"

# Install the pinned node runtime and the node dependencies.
setup: setup-python
    {{mise}} install
    mkdir -p {{cache}}/npm-cache {{runtime}}/logs
    {{npm}} ci

# Create the routed python venv used by the repo scripts. Safe to re-run.
setup-python:
    #!/opt/homebrew/bin/bash
    set -euo pipefail
    if [ ! -x "{{python}}" ]; then
      /opt/homebrew/opt/python@3.14/bin/python3.14 -m venv "{{venv}}"
    fi
    "{{python}}" --version

# Run every quality gate and record pass/fail for each, including gates that fail.
baseline:
    {{bash}} scripts/baseline-gates.sh

# Same, without building a VSIX — faster inner loop.
baseline-quick:
    {{bash}} scripts/baseline-gates.sh --skip-package

lint:
    {{npm}} run lint

compile:
    {{npm}} run compile

webview:
    {{npm}} run build:webview

# Upstream declares this script but ships no test directory or runner. Expected to fail until M2 adds a harness.
test:
    {{npm}} test

# Build a VSIX into tools-runtime, never into the repo.
package:
    mkdir -p {{runtime}}
    {{npx}} --yes @vscode/vsce package --out {{runtime}}/argus-$(date +%Y%m%d_%H%M).vsix

# Refresh the vendored model pricing table from the LiteLLM dataset. Developer action only; never called at runtime.
pricing-refresh:
    {{node}} scripts/refresh-pricing.mjs

# Report whether the vendored pricing table has drifted from upstream. Exits non-zero when stale.
pricing-check:
    {{node}} scripts/refresh-pricing.mjs --check

# Classify local Claude transcripts against the 15 plan fixture categories. Prints paths and counts only, never content.
fixture-scan *ARGS:
    {{python}} scripts/fixture-scan.py {{ARGS}}

# Apply the workspace markdown rules to a doc: tables first, then prose wrap and table of contents.
fmt-doc FILE:
    {{node}} /Volumes/Data/_ai/_scripts/scripts_stuff/vscode_extensions/shared/table-reflow/cli.mjs {{FILE}} --width 200 --measure-rendered --in-place
    {{python}} ~/.agents/scripts/markdown-rewrap/rewrap.py {{FILE}} --width 200 --update

# Fail early rather than falling back to the host interpreter.
_require-venv:
    @test -x "{{python}}" || { echo "venv missing at {{python}} — run: just setup-python" >&2; exit 1; }

# Rebuild the sanitized Claude fixture corpus. Reads real transcripts; verifies no secret survives.
fixtures: _require-venv
    {{python}} scripts/make-fixtures.py

# Verify the existing fixtures carry no forbidden pattern, without rebuilding them.
fixtures-verify: _require-venv
    {{python}} scripts/make-fixtures.py --verify-only

# Governance coherence checks. Must exit 0 before durable work is called complete.
check: _require-venv
    {{python}} scripts/check_governance.py

# Show how far the fork has diverged from the recorded upstream baseline.
diff-baseline:
    git diff --stat baseline-upstream-argus..HEAD

# Fetch upstream and report what has landed there since the baseline tag.
upstream-log:
    git fetch upstream --tags
    git log --oneline baseline-upstream-argus..upstream/main

clean:
    {{npm}} run clean
