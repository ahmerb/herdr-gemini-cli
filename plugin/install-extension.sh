#!/bin/sh
# Installs the herdr-gemini-cli Gemini CLI extension (the hooks that report
# pane state to Herdr) at the same revision as this plugin checkout.
#
# Herdr runs this as the [[build]] step of `herdr plugin install` and `herdr
# plugin update` (cwd = the fresh plugin checkout), so one `herdr plugin
# install` sets up both halves. Gemini copies the extension into
# ~/.gemini/extensions, so it keeps working after Herdr cleans up old
# checkouts.
#
# Install source:
#   1. This checkout's git remote at its exact HEAD commit. Gemini's folder
#      trust prompt only applies to local-path installs, and Herdr's managed
#      checkout is not a trusted folder, so a local install would stop at a
#      [y/N] prompt (and Gemini 0.68 hangs on it rather than reading EOF).
#   2. Fallback: the local path, e.g. an unpushed dev commit or no git metadata.
#      We answer "n" to the trust prompt so an untrusted folder fails fast with
#      a clear message instead of hanging.
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

installed() {
  echo "herdr-gemini-cli: Gemini CLI extension installed from $1. Restart running Gemini CLI sessions to load it."
  exit 0
}

remote=""
commit=""
if command -v git >/dev/null 2>&1; then
  remote=$(git remote get-url origin 2>/dev/null || true)
  commit=$(git rev-parse HEAD 2>/dev/null || true)
fi

if [ -n "$remote" ] && [ -n "$commit" ]; then
  if "$gemini" extensions install "$remote" --ref "$commit" --consent --skip-settings </dev/null; then
    installed "$remote at $commit"
  fi
  echo "herdr-gemini-cli: installing from $remote at $commit failed; trying the local checkout instead." >&2
fi

if printf 'n\n' | "$gemini" extensions install . --consent --skip-settings; then
  installed "$(pwd)"
fi

fail "'gemini extensions install' failed (see output above). If Gemini reported that the folder is not trusted, install the extension directly instead: gemini extensions install https://github.com/ahmerb/herdr-gemini-cli"
