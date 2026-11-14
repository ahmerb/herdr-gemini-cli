#!/bin/sh
# Reinstalls the herdr-gemini-cli Gemini CLI extension from this plugin
# checkout (the "Gemini: reinstall extension" action), using the same
# install-extension.sh as the plugin's build step.
#
# If the extension is currently a dev link (`gemini extensions link .`),
# reinstalling would replace the link with a copy. In that case ask first
# (default: no), and leave it alone when there is no terminal to ask on,
# unless HGC_REPLACE_LINK=1.
set -eu

cd "$(dirname "$0")/.."
. ./plugin/lib.sh

hgc_use_recorded_paths

if gemini=$(command -v gemini 2>/dev/null); then
  # Print the Source line of our extension's block, if it is a link. Gemini
  # 0.68 prints the list to stderr (stdout is empty), so read both streams.
  link=$("$gemini" extensions list </dev/null 2>&1 | awk -v name="$HGC_EXTENSION_NAME" '
    /^[^ \t]/ { mine = index($0, " " name " (") > 0 }
    mine && /^[ \t]+Source: .*\(Type: link\)/ { sub(/^[ \t]+Source: /, ""); print; exit }
  ' || true)
  if [ -n "$link" ]; then
    echo "herdr-gemini-cli: the Gemini CLI extension is currently a dev link:"
    echo "  $link"
    echo "Reinstalling replaces the link with a copy of this plugin checkout ($(pwd))."
    if [ "${HGC_REPLACE_LINK:-}" = 1 ]; then
      answer=y
    elif [ -t 0 ]; then
      printf 'Replace the link? [y/N] '
      read -r answer || answer=n
    else
      answer=n
    fi
    case "$answer" in
      y | Y | yes | YES) ;;
      *)
        echo "herdr-gemini-cli: kept the dev link; nothing was reinstalled."
        exit 0
        ;;
    esac
  fi
fi

# install-extension.sh reports a missing gemini/node itself.
exec sh plugin/install-extension.sh
