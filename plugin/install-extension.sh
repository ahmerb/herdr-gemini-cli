#!/bin/sh
# Installs this checkout as the herdr-gemini-cli Gemini CLI extension (the hooks
# that report pane state to Herdr).
#
# Herdr runs this as the [[build]] step of `herdr plugin install` and `herdr
# plugin update` (cwd = the fresh plugin checkout), so one `herdr plugin
# install` sets up both halves. `gemini extensions install <path>` copies the
# extension, so it keeps working after Herdr cleans up old checkouts.
set -eu

cd "$(dirname "$0")/.."
. ./plugin/lib.sh

fail() {
  printf 'herdr-gemini-cli: %s\n' "$1" >&2
  exit 1
}

# Paths recorded by a previous install win over PATH (matters when re-run from
# a plugin action, which gets the Herdr server's PATH).
hgc_use_recorded_paths

gemini=$(command -v gemini 2>/dev/null || true)
[ -n "$gemini" ] ||
  fail "Gemini CLI ('gemini') not found on PATH. Install it first: https://github.com/google-gemini/gemini-cli"
node=$(command -v node 2>/dev/null || true)
[ -n "$node" ] ||
  fail "Node.js ('node') not found on PATH. Install Node.js 20+ first: https://nodejs.org"

printf 'GEMINI_BIN=%s\nNODE_BIN=%s\n' "$gemini" "$node" >"$HGC_PATHS_FILE"

# `gemini extensions install` refuses to overwrite an existing install, so
# remove any previous copy (or dev link) first. This fails harmlessly when the
# extension is not installed.
"$gemini" extensions uninstall "$HGC_EXTENSION_NAME" </dev/null >/dev/null 2>&1 || true

"$gemini" extensions install . --consent --skip-settings </dev/null ||
  fail "'gemini extensions install' failed (see output above)."

echo "herdr-gemini-cli: Gemini CLI extension installed. Restart running Gemini CLI sessions to load it."
