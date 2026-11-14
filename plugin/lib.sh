# Shared helpers for herdr-gemini-cli plugin scripts (POSIX sh).
# Source from the plugin root: `. ./plugin/lib.sh`.
#
# Herdr runs plugin actions and panes with the Herdr server's PATH, which often
# lacks the `node` and `gemini` that `herdr plugin install` found in the user's
# shell (e.g. nvm or npm-global installs). install-extension.sh records their
# absolute paths in $HGC_PATHS_FILE, and hgc_use_recorded_paths puts their
# directories at the front of PATH. Prepending the directory (rather than only
# calling the recorded binary) matters: npm-installed `gemini` starts with
# `#!/usr/bin/env node`, so `node` must be on PATH as well.

HGC_EXTENSION_NAME=herdr-gemini-cli
HGC_PATHS_FILE=${HGC_PATHS_FILE:-plugin/.paths}

# hgc_recorded KEY: print the path recorded for KEY (GEMINI_BIN, NODE_BIN) if it
# is still executable; print nothing otherwise.
hgc_recorded() {
  [ -f "$HGC_PATHS_FILE" ] || return 0
  _hgc_path=$(sed -n "s/^$1=//p" "$HGC_PATHS_FILE" | head -n 1)
  if [ -n "$_hgc_path" ] && [ -x "$_hgc_path" ]; then
    printf '%s\n' "$_hgc_path"
  fi
}

# hgc_use_recorded_paths: prepend the directories of the recorded node and
# gemini binaries to PATH, so plain `node` / `gemini` resolve to them.
hgc_use_recorded_paths() {
  for _hgc_key in GEMINI_BIN NODE_BIN; do
    _hgc_bin=$(hgc_recorded "$_hgc_key")
    if [ -n "$_hgc_bin" ]; then
      PATH="$(dirname "$_hgc_bin"):$PATH"
    fi
  done
  export PATH
}

# hgc_notify TITLE [BODY]: best-effort Herdr notification. Plugin action output
# only reaches `herdr plugin log list`, so use this for errors users must see.
hgc_notify() {
  if [ -n "${2:-}" ]; then
    "${HERDR_BIN_PATH:-herdr}" notification show "$1" --body "$2" >/dev/null 2>&1 || true
  else
    "${HERDR_BIN_PATH:-herdr}" notification show "$1" >/dev/null 2>&1 || true
  fi
}
