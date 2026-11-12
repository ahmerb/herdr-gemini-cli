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

### Method 1: Install via Gemini CLI (Recommended)

Install directly from Git into your Gemini CLI extension registry:

```bash
gemini extensions install https://github.com/ahmerb/herdr-gemini-cli
```

Verify that the extension is active:

```bash
gemini extensions list
```

### Method 2: Link for Local Development

Clone the repository and link it into Gemini CLI:

```bash
git clone https://github.com/ahmerb/herdr-gemini-cli.git
cd herdr-gemini-cli
npm install
npm run build
gemini extensions link .
```

---

## Diagnostics & Troubleshooting

Run the included doctor utility inside your terminal to validate environment detection and test reporting:

```bash
# If cloned locally:
./bin/herdr-gemini-cli.js

# Or via npm/npx:
npx herdr-gemini-cli
```

**Example Doctor Output (Inside Herdr):**

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
