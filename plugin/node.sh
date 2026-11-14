#!/bin/sh
# Launcher for Node-based plugin commands, e.g. in herdr-plugin.toml:
#   command = ["sh", "plugin/node.sh", "dist/plugin/commands/<name>.js"]
#
# Uses the node/gemini recorded at install time (see plugin/lib.sh), falling
# back to PATH, and tells the user via a Herdr notification if node is missing.
set -eu

cd "$(dirname "$0")/.."
. ./plugin/lib.sh

hgc_use_recorded_paths

if ! node=$(command -v node 2>/dev/null); then
  hgc_notify "herdr-gemini-cli: node not found" \
    "Install Node.js 20+, then run: herdr plugin update herdr-gemini-cli"
  echo "herdr-gemini-cli: node not found on PATH ($PATH)" >&2
  exit 127
fi

exec "$node" "$@"
