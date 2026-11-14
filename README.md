# herdr-gemini-cli

[![CI](https://github.com/ahmerb/herdr-gemini-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/ahmerb/herdr-gemini-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Vibe Coded](https://img.shields.io/badge/vibe--coded-ff69b4)

**Herdr integration for Google Gemini CLI.**

`herdr-gemini-cli` brings native, agent-aware multiplexing and session management to **[Gemini CLI](https://github.com/google-gemini/gemini-cli)** inside **[Herdr](https://herdr.dev)**. It enables real-time status tracking in Herdr's sidebar and status bar, automated session resumption on restart, and non-blocking notification alerts when Gemini CLI is waiting for user confirmation.

![Herdr Gemini CLI Integration](screenshot.png)
*Herdr sidebar tracking multiple Gemini CLI sessions across lifecycle states: `x` (blocked waiting for tool approval), `o` (idle), and `◐` (actively working).*

> [!NOTE]
> This project is human-supervised, test-covered, but ultimately vibe-coded. Use at your own risk.

---

## Features

- **One-Command Install:** `herdr plugin install ahmerb/herdr-gemini-cli` installs the Herdr plugin and the Gemini CLI extension together, and `herdr plugin update` keeps them in sync.
- **Authoritative State Tracking:** Accurately maps Gemini CLI's internal lifecycle hooks to Herdr states:
  - **`working`**: Emitted when a turn starts and the model or tool is active.
  - **`idle`**: Emitted when a turn finishes and the agent is ready for user input.
  - **`blocked`**: Emitted with tool details whenever Gemini CLI prompts for action confirmation (e.g. `run_shell_command`).
- **Native Session Resumption:** Automatically registers active conversation UUIDs with Herdr. When Herdr restores a workspace or restarts, panes automatically resume via `gemini --resume <session_id>`.
- **Automatic Pane Cleanup:** Explicitly releases pane ownership when Gemini CLI exits cleanly or clears.
- **Zero Runtime Dependencies:** Compiles into lightweight, zero-dependency CommonJS artifacts. Does not require `jq`, Python, or `node_modules` at runtime—it runs directly on the ambient Node.js instance powering Gemini CLI.
- **Dormant Outside Herdr:** Strictly guards execution using `HERDR_ENV=1`. Outside of Herdr, hooks execute dormancy checks and exit in under 5ms with zero side effects.
- **Built-in Diagnostic Doctor:** Ships with an interactive doctor CLI to verify Herdr socket connectivity, pane status, and reporting delivery.

---

## Installation

**Prerequisites:** [Herdr](https://herdr.dev) 0.9.5 or newer, [Gemini CLI](https://github.com/google-gemini/gemini-cli), Node.js 20+ and `git`. `gemini` and `node` must be on your `PATH`.

### Method 1: Install as a Herdr plugin (Recommended)

One command sets up everything. You don't need to clone anything:

```bash
herdr plugin install ahmerb/herdr-gemini-cli
```

What happens:

1. Herdr clones the repository into its own managed directory and shows a preview of the plugin, including its build step `sh plugin/install-extension.sh`. Confirm to continue.
2. The build step installs the Gemini CLI extension (the hooks that report pane state) at the exact commit Herdr checked out, using `gemini extensions install <repo url> --ref <commit> --consent --skip-settings`. Any existing `herdr-gemini-cli` Gemini extension is replaced. (Installing from Herdr's checkout folder directly would stop at Gemini's folder-trust prompt.) The step also records where it found `node` and `gemini`, so plugin actions still work when Herdr's own `PATH` lacks them (common with nvm or npm-global installs).
3. Herdr registers the plugin and its actions (see [Herdr plugin](#herdr-plugin)).

Restart any Gemini CLI sessions that were already running so they load the hooks.

Check that both halves are installed:

```bash
herdr plugin list            # herdr-gemini-cli is listed and enabled
gemini extensions list       # herdr-gemini-cli is listed
```

Update both together. This re-runs the build step, so the Gemini extension always matches the plugin version:

```bash
herdr plugin update herdr-gemini-cli
```

### Method 2: Gemini CLI extension only

If you only want state tracking and session resume, without the Herdr plugin actions:

```bash
gemini extensions install https://github.com/ahmerb/herdr-gemini-cli
```

### Method 3: Local development

```bash
git clone https://github.com/ahmerb/herdr-gemini-cli.git
cd herdr-gemini-cli
npm install
npm run build
herdr plugin link .          # register the plugin from this working tree
gemini extensions link .     # symlink the Gemini extension to this working tree
```

`herdr plugin link` does not run the build step, so link the Gemini extension yourself as shown. Unlink with `herdr plugin unlink herdr-gemini-cli` and `gemini extensions uninstall herdr-gemini-cli`.

### Uninstalling

`herdr plugin uninstall` only removes the Herdr plugin. Remove the Gemini extension separately:

```bash
herdr plugin uninstall herdr-gemini-cli
gemini extensions uninstall herdr-gemini-cli
```

If the Gemini extension stays installed, it keeps reporting pane state whenever you run Gemini CLI inside Herdr. Outside Herdr it does nothing.

---

## Herdr plugin

The Herdr plugin adds Gemini actions to Herdr. Run an action with `herdr plugin action invoke <action id>`, or bind it to a key (see [Keybindings](#keybindings)). List them with:

```bash
herdr plugin action list --plugin herdr-gemini-cli
```

Plugin logs (output of each action run) are available via `herdr plugin log list --plugin herdr-gemini-cli`.

### Clear blocked state

_Coming soon ([#6](https://github.com/ahmerb/herdr-gemini-cli/issues/6))._

### New Gemini pane

_Coming soon ([#7](https://github.com/ahmerb/herdr-gemini-cli/issues/7))._

### Reinstall / remove Gemini extension

_Coming soon ([#8](https://github.com/ahmerb/herdr-gemini-cli/issues/8))._

### Doctor

**Gemini: doctor** (`herdr-gemini-cli.doctor`) opens a popup that checks the whole setup and prints ✅ or ❌ per check, each ❌ with a one-line fix:

- Herdr version (`$HERDR_BIN_PATH --version`)
- the Node.js running the plugin (path and version; warns below Node 20)
- the `node` / `gemini` paths recorded at install in `plugin/.paths` (absent for a `herdr plugin link`ed checkout, which is fine)
- that the Herdr socket can be reached, and which panes are registered as `gemini-cli` agents, with their states
- `gemini --version`
- that the `herdr-gemini-cli` Gemini extension is installed (version, install type and ref), and that its version matches the plugin

If the pane under the popup is a Gemini CLI pane, the doctor also sends a test `report-agent` with that pane's current state, so what Herdr shows doesn't change. Over any other pane (a shell, or another agent) it only makes read-only calls, so it never takes that pane over. Press any key to close the popup.

```bash
herdr plugin action invoke herdr-gemini-cli.doctor
```

### Session picker

_Coming soon ([#10](https://github.com/ahmerb/herdr-gemini-cli/issues/10))._

### Keybindings

Plugins can't register keybindings, so add them to your Herdr config (`~/.config/herdr/config.toml`) and run `herdr server reload-config`. Each binding is a `[[keys.command]]` entry with `type = "plugin_action"`:

```toml
[[keys.command]]
key = "prefix+alt+d"
type = "plugin_action"
command = "herdr-gemini-cli.doctor"
description = "Gemini: doctor"
```

Suggested bindings (none clash with Herdr's defaults or its example `prefix+alt+g` lazygit popup):

| Key | Action id | Action |
| :--- | :--- | :--- |
| `prefix+alt+u` | `herdr-gemini-cli.clear-blocked` | Clear blocked state _(coming soon)_ |
| `prefix+alt+n` | `herdr-gemini-cli.new-pane` | New Gemini pane _(coming soon)_ |
| `prefix+alt+d` | `herdr-gemini-cli.doctor` | Doctor |
| `prefix+alt+r` | `herdr-gemini-cli.resume-session` | Session picker _(coming soon)_ |

---

## Diagnostics & Troubleshooting

There are two doctors:

- **Plugin doctor** (inside Herdr, recommended): run `herdr plugin action invoke herdr-gemini-cli.doctor`, or press `prefix+alt+d` if you added the [keybinding](#keybindings). It checks Herdr, Node.js, Gemini CLI, the Gemini extension, the Herdr socket and the registered Gemini panes (see [Doctor](#doctor)).
- **CLI doctor**: run inside the Gemini CLI pane's shell (or any Herdr pane) to check environment detection and test reporting from that pane:

```bash
# If cloned locally:
./bin/herdr-gemini-cli.js

# Or via npm/npx:
npx herdr-gemini-cli
```

Note that the CLI doctor reports `idle` as a `gemini-cli` agent on the pane it runs in.

**Example plugin doctor output:**

```text
=== Herdr Gemini CLI doctor (plugin 0.1.0) ===

➖ Focused pane: w3:p2 (agent: gemini-cli, status: idle)
✅ Herdr: herdr 0.9.5 (/home/user/.local/bin/herdr)
✅ Node.js: v22.12.0 (/home/user/.nvm/versions/node/v22.12.0/bin/node)
✅ Recorded GEMINI_BIN: /home/user/.nvm/versions/node/v22.12.0/bin/gemini
✅ Recorded NODE_BIN: /home/user/.nvm/versions/node/v22.12.0/bin/node
✅ Herdr socket: reachable (/home/user/.config/herdr/herdr.sock)
✅ Gemini agents: 1 pane
     w3:p2  idle  /home/user/project
✅ Test report: delivered to w3:p2 (state: idle)
✅ Gemini CLI: 0.68.0
❌ Gemini extension: herdr-gemini-cli is not installed
   Fix: run Gemini: reinstall extension (herdr-gemini-cli.reinstall-extension)

1 problem(s), 0 warning(s) found.
Press any key to close
```

**Example CLI doctor output (inside Herdr):**

```text
=== Herdr Gemini CLI Integration Doctor ===

HERDR_ENV:          1
HERDR_PANE_ID:      wD:p1
HERDR_BIN_PATH:     /home/user/.local/bin/herdr
HERDR_SOCKET_PATH:   /home/user/.config/herdr/herdr.sock
Herdr Status:       ACTIVE (Running inside Herdr)

Herdr binary check:
  ✅ herdr 0.9.5

Testing agent report ping (state: idle)...
  Executing: /home/user/.local/bin/herdr pane report-agent wD:p1 --source gemini-cli --agent gemini-cli --state idle --seq 1794470669137000
  ✅ Test report delivered successfully to Herdr!

Doctor check completed.
```

---

## Architecture & Lifecycle Mapping

Herdr uses an in-band, push-based reporting architecture. Gemini CLI hooks trigger the dispatcher (`dist/hooks/dispatcher.js`), which translates internal events into Herdr CLI calls:

| Gemini CLI Lifecycle Event | Trigger Condition | Herdr Reported State | Additional Data |
| :--- | :--- | :--- | :--- |
| **`SessionStart`** | Startup, resume, or `/clear` | `idle` | Registers session UUID and resume command: `gemini --resume <session_id>` |
| **`BeforeAgent`** | User submits prompt; agent planning begins | `working` | Session ID |
| **`Notification`** | `ToolPermission` confirmation required | `blocked` | `--message "Waiting for approval to run <tool_name>"` |
| **`BeforeTool`** | User approves action; tool begins execution | `working` | Clears blocked state |
| **`AfterAgent`** | Model finishes turn; awaiting next prompt | `idle` | Session ID |
| **`SessionEnd`** | CLI exits (`/exit`, `Ctrl+D`, clear) | *(released)* | Executes `pane release-agent` |

> **Known limitation:** Gemini CLI fires no hook when a tool permission prompt is denied or cancelled, so the pane stays `blocked` until the next prompt is submitted.

### Sequence Numbering (`--seq`)

Herdr requires monotonically increasing sequence numbers to reject out-of-order or stale events. `herdr-gemini-cli` uses microsecond-resolution monotonic counters to guarantee strict ordering across asynchronous turns.

---

## Development

Prerequisites:
- Node.js >= 18.0.0
- npm >= 9.0.0

```bash
# Install development dependencies
npm install

# Run type checking
npm run typecheck

# Run test suite
npm test

# Build bundled artifacts
npm run build

# Validate extension schema with Gemini CLI
gemini extensions validate .
```

---

## Contributing

Contributions, bug reports, and suggestions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on code style, testing, and pull requests.

---

## License

This project is licensed under the [MIT License](./LICENSE).
