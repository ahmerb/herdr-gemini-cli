#!/bin/sh
# Plugin action "Gemini: new pane" (herdr-gemini-cli.new-pane).
#
# Splits the focused pane to the right, focuses the new pane, and starts
# `gemini` in its shell. The new pane is a normal shell pane, so the Gemini
# hooks and session resume work as usual and exiting gemini drops back to the
# shell.
#
# No --cwd is passed: `herdr pane split` already starts the new pane in the
# source pane's current directory (that of its foreground process, so a `cd`
# in a subshell is followed too), and that avoids decoding JSON strings in sh.
set -eu

cd "$(dirname "$0")/.."
. ./plugin/lib.sh

hgc_use_recorded_paths

herdr=${HERDR_BIN_PATH:-herdr}

# hgc_json_id KEY: read JSON on stdin and print the first "KEY":"<id>" value.
# Herdr ids are plain (e.g. w3:p8). Splitting at , { } puts each member on its
# own line, and a piece of a JSON string can't start with an unescaped quote,
# so the anchored match only ever sees real keys. No jq needed.
hgc_json_id() {
  tr ',{}' '\n\n\n' |
    sed -n "s/^[[:space:]]*\"$1\"[[:space:]]*:[[:space:]]*\"\([A-Za-z0-9:._-]*\)\"[[:space:]]*\$/\1/p" |
    head -n 1
}

# Check before splitting, so a missing gemini never leaves an empty pane. The
# recorded install-time path counts: Herdr's own PATH often lacks gemini even
# though the user's shell (which runs it in the new pane) has it.
if ! command -v gemini >/dev/null 2>&1; then
  hgc_notify "herdr-gemini-cli: gemini not found" \
    "Install Gemini CLI, then run: herdr plugin update herdr-gemini-cli"
  echo "herdr-gemini-cli: gemini not found on PATH ($PATH)" >&2
  exit 127
fi

source_pane=$(printf '%s' "${HERDR_PLUGIN_CONTEXT_JSON:-}" | hgc_json_id focused_pane_id)
source_pane=${source_pane:-${HERDR_PANE_ID:-}}
if [ -n "$source_pane" ]; then
  set -- "$source_pane"
else
  set -- --current
fi

if ! split=$("$herdr" pane split "$@" --direction right --focus); then
  hgc_notify "herdr-gemini-cli: could not split pane" "See: herdr plugin log list --plugin herdr-gemini-cli"
  echo "herdr-gemini-cli: herdr pane split failed: $split" >&2
  exit 1
fi

new_pane=$(printf '%s\n' "$split" | hgc_json_id pane_id)
if [ -z "$new_pane" ]; then
  hgc_notify "herdr-gemini-cli: could not split pane" "See: herdr plugin log list --plugin herdr-gemini-cli"
  echo "herdr-gemini-cli: no pane id in herdr pane split output: $split" >&2
  exit 1
fi

# Typed into the new pane's interactive shell, which has the user's own PATH.
if ! "$herdr" pane run "$new_pane" gemini >/dev/null; then
  "$herdr" pane close "$new_pane" >/dev/null 2>&1 || true
  hgc_notify "herdr-gemini-cli: could not start gemini" "See: herdr plugin log list --plugin herdr-gemini-cli"
  echo "herdr-gemini-cli: herdr pane run $new_pane gemini failed" >&2
  exit 1
fi

echo "herdr-gemini-cli: started gemini in pane $new_pane (split from ${source_pane:-current pane})"
