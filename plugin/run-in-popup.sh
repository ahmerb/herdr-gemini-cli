#!/bin/sh
# Runs a plugin script inside a Herdr popup and keeps the popup open until the
# user presses Enter (a popup closes as soon as its command exits), e.g.:
#   command = ["sh", "plugin/run-in-popup.sh", "plugin/remove-extension.sh"]
#
# The wait is skipped when stdin is not a terminal or HGC_NO_WAIT=1 (tests).
# Exits with the script's status.
set -u

cd "$(dirname "$0")/.."

[ $# -ge 1 ] || { echo "usage: run-in-popup.sh <script> [args...]" >&2; exit 2; }

script=$1
shift
sh "$script" "$@"
status=$?

echo
if [ "$status" -eq 0 ]; then
  echo "Done."
else
  echo "Failed (exit status $status)."
fi

if [ "${HGC_NO_WAIT:-}" != 1 ] && [ -t 0 ]; then
  printf 'Press Enter to close. '
  read -r _ || true
fi
exit "$status"
