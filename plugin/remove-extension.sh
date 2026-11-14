#!/bin/sh
# Uninstalls the herdr-gemini-cli Gemini CLI extension (the "Gemini: remove
# extension" action). `herdr plugin uninstall` has no hook to do this, so run
# it before uninstalling the plugin. Safe to run when the extension is not
# installed. A dev link (`gemini extensions link .`) is removed too; the
# working tree itself is untouched.
set -eu

cd "$(dirname "$0")/.."
. ./plugin/lib.sh

fail() {
  printf 'herdr-gemini-cli: %s\n' "$1" >&2
  exit 1
}

hgc_use_recorded_paths

gemini=$(command -v gemini 2>/dev/null || true)
[ -n "$gemini" ] ||
  fail "Gemini CLI ('gemini') not found on PATH ($PATH). Nothing was removed. If it is installed, run: gemini extensions uninstall $HGC_EXTENSION_NAME"

echo "Removing the $HGC_EXTENSION_NAME Gemini CLI extension..."
if output=$("$gemini" extensions uninstall "$HGC_EXTENSION_NAME" </dev/null 2>&1); then
  [ -z "$output" ] || printf '%s\n' "$output"
  echo "herdr-gemini-cli: Gemini CLI extension removed. Restart running Gemini CLI sessions to unload it."
  exit 0
fi

case "$output" in
  *"not found"* | *"not installed"*)
    echo "herdr-gemini-cli: the Gemini CLI extension is not installed; nothing to remove."
    exit 0
    ;;
esac

printf '%s\n' "$output" >&2
fail "'gemini extensions uninstall $HGC_EXTENSION_NAME' failed (see output above)."
