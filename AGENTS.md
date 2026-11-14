# AGENTS.md - Herdr Gemini CLI Integration

This document outlines the architecture, development commands, and manual verification procedures for agents and engineers working on `herdr-gemini-cli`.

---

## Development & Test Commands

```bash
npm run typecheck                  # Strict TypeScript validation
npm test                           # Vitest test suite (unit + integration)
npm run build                      # Bundles standalone CJS to dist/
gemini extensions validate .       # Official Gemini CLI schema validator
```

`dist/` is committed (the Herdr plugin and Gemini extension run it without an npm build), and tsup does not clean it. Rebuild from clean with `rm -rf dist && npm run build` and commit the result.

---

## Herdr Plugin Layout

- `herdr-plugin.toml`: the Herdr plugin manifest. `tests/plugin/manifest.test.ts` validates it, including that `version` matches `package.json` and `gemini-extension.json`.
- `plugin/install-extension.sh`: the `[[build]]` step. Installs the Gemini extension from the checkout's git remote at its `HEAD` commit (a local-path install would stop at Gemini's folder-trust prompt, and Gemini 0.68 hangs on that prompt rather than reading EOF), falling back to the local path. It also records the absolute `node` and `gemini` paths in `plugin/.paths` (gitignored).
- `plugin/lib.sh`: shared sh helpers. `hgc_use_recorded_paths` puts the recorded binaries' directories at the front of `PATH`, because Herdr runs plugin commands with the Herdr server's `PATH`.
- `plugin/node.sh`: launcher for Node-based commands: `command = ["sh", "plugin/node.sh", "dist/plugin/commands/<name>.js"]`.
- `src/plugin/commands/*.ts`: plugin command entry points, built to `dist/plugin/commands/*.js`. Like the hook dispatcher, they must not export anything; put testable logic in `src/plugin/`.
- `src/plugin/context.ts`: parses `HERDR_PLUGIN_CONTEXT_JSON`. Popups don't get `HERDR_PANE_ID`, so target `focused_pane_id` via `new HerdrClient({ paneId })`.

Only one checkout can be linked at a time: the plugin id `herdr-gemini-cli` and the Gemini extension are global to the machine.

---

## Manual Verification Runbook

Follow these steps to manually test and inspect the integration in a live environment:

### Step 1: Run the Built-In Doctor

Verify that the integration correctly identifies your Herdr environment and can invoke the Herdr binary:

```bash
./bin/herdr-gemini-cli.js
```

**Expected Output (Inside Herdr):**
- Displays `HERDR_ENV: 1`, active pane ID, binary path, and socket path.
- Verifies Herdr binary execution (`herdr --version`).
- Emits a test report ping to Herdr: `✅ Test report delivered successfully to Herdr!`.

---

### Step 2: Link the Extension into Gemini CLI

Link the local development repository into Gemini CLI:

```bash
gemini extensions link .
```

Verify that the extension is active:

```bash
gemini extensions list
```

Confirm that `herdr-gemini-cli (0.1.0)` appears in the installed extensions list.

---

### Step 3: Inspect Active Agent Status via Herdr CLI

From another terminal pane or window, run Herdr's agent status command:

```bash
herdr agent list
```

**Expected Output:**
- The pane running Gemini CLI is registered with:
  - Agent: `gemini-cli`
  - Source: `gemini-cli`
  - Initial State: `idle`

---

### Step 4: Verify Lifecycle State Transitions

In a Herdr pane with Gemini CLI active, submit queries and observe Herdr's sidebar / status bar:

1. **Turn Start (`working`):**
   - Submit any prompt (e.g. `explain this repo`).
   - Herdr's pane state immediately changes to **`working`**.
2. **Tool Permission Block (`blocked`):**
   - Trigger an unapproved tool call (e.g., file modification or `run_shell_command`).
   - When Gemini CLI displays the confirmation prompt, Herdr immediately marks the pane as **`blocked`** with the message detailing the requested action.
3. **Approval (`working`):**
   - Accept the tool confirmation.
   - Herdr pane state immediately returns to **`working`**.
4. **Turn Finish (`idle`):**
   - Once Gemini finishes generating its response and waits for user input, Herdr transitions to **`idle`**.
5. **Session Exit (`released`):**
   - Exit the CLI (`/exit` or `Ctrl+D`).
   - Herdr releases agent ownership from the pane.

---

### Step 5: Test Session Resumption

1. Start a Gemini CLI session and run a query.
2. Exit the session.
3. In another pane, inspect Herdr's stored pane resume command:
   ```bash
   herdr pane list
   ```
   Herdr should store: `gemini --resume <session_uuid>`.
4. When Herdr restores panes on restart, it automatically resumes into the same session.

---

### Step 6: Verify Dormancy Outside Herdr

In a standard shell outside Herdr (where `HERDR_ENV` is unset):

```bash
HERDR_ENV= ./bin/herdr-gemini-cli.js
```

**Expected Output:**
- Displays `Herdr Status: DORMANT (Outside Herdr)`.
- Exits cleanly (`exit 0`) without invoking any socket or child process calls.

---

### Step 7: Install as a Herdr Plugin

From a clean state (no plugin linked or installed, no `herdr-gemini-cli` Gemini extension):

```bash
herdr plugin install ahmerb/herdr-gemini-cli   # add --ref <branch> to test a branch
herdr plugin list                              # herdr-gemini-cli is listed and enabled
gemini extensions list                         # herdr-gemini-cli is listed (Type: git, Ref: <commit>)
herdr plugin list --plugin herdr-gemini-cli --json   # plugin_root = the managed checkout
```

**Expected:**
- The install preview lists the build step `sh plugin/install-extension.sh`.
- The build succeeds and prints `Gemini CLI extension installed from https://github.com/... at <commit>`.
- `<plugin_root>/plugin/.paths` records absolute `GEMINI_BIN` and `NODE_BIN` paths.
- Running `herdr plugin update herdr-gemini-cli` (or installing again) succeeds and replaces the Gemini extension.
- If `gemini` is not on `PATH`, the install aborts with `Gemini CLI ('gemini') not found on PATH` and the plugin is not registered.

For local development use `herdr plugin link .` and `gemini extensions link .` instead (`link` skips the build step). Unlink both when done.

---

### Step 8: Herdr Plugin Actions

Link the plugin (`herdr plugin link .`), then check each action. `herdr plugin log list --plugin herdr-gemini-cli` shows each run's output.

- **Clear blocked state:** _coming soon (#6)._
- **New Gemini pane:** _coming soon (#7)._
- **Reinstall / remove Gemini extension:** `herdr plugin action invoke herdr-gemini-cli.remove-extension` opens a popup that uninstalls the extension and waits for Enter; afterwards `gemini extensions list` no longer lists `herdr-gemini-cli`, and running it again reports "not installed; nothing to remove" and succeeds. `herdr plugin action invoke herdr-gemini-cli.reinstall-extension` runs `plugin/install-extension.sh` in a popup (from a linked worktree with unpushed commits it falls back to the local path, which fails with a clear message unless Gemini already trusts the folder); the extension is listed again, and running it twice succeeds. With the extension dev-linked (`gemini extensions link .`), reinstall shows the link source and asks `Replace the link? [y/N]`; Enter keeps the link. With `gemini` hidden from the Herdr server's `PATH` and `plugin/.paths` moved aside, both popups show "Gemini CLI ('gemini') not found". Scripts: `plugin/open-popup.sh` (action), `plugin/run-in-popup.sh` (pane wrapper; `HGC_NO_WAIT=1` or a non-TTY stdin skips the Enter wait), `plugin/reinstall-extension.sh`, `plugin/remove-extension.sh`.
- **Doctor:** _coming soon (#9)._
- **Session picker:** _coming soon (#10)._
