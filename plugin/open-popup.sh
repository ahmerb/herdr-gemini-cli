#!/bin/sh
# Opens one of this plugin's popup panes, e.g. in herdr-plugin.toml:
#   command = ["sh", "plugin/open-popup.sh", "<pane id>"]
#
# Action output only reaches `herdr plugin log list`, so actions that print
# something for the user open a [[panes]] popup that runs the real script
# through plugin/run-in-popup.sh.
set -eu

cd "$(dirname "$0")/.."
. ./plugin/lib.sh

[ $# -eq 1 ] || { echo "usage: open-popup.sh <pane id>" >&2; exit 2; }

if ! "${HERDR_BIN_PATH:-herdr}" plugin pane open --plugin "$HGC_EXTENSION_NAME" --entrypoint "$1"; then
  hgc_notify "herdr-gemini-cli: could not open popup" \
    "Close any open modal (settings, copy mode, popup) and try again."
  exit 1
fi
