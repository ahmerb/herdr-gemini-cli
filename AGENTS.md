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
