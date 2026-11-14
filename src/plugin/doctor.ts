// "Gemini: doctor" plugin popup (herdr-gemini-cli.doctor). Checks the whole
// setup from inside Herdr and prints ✅/❌ per check, each ❌ with a fix.
//
// A popup is not a pane: it gets no HERDR_PANE_ID. The tiled pane underneath
// comes from HERDR_PLUGIN_CONTEXT_JSON. The doctor only sends a test
// report-agent to that pane when it is already a `gemini-cli` agent, and then
// with the pane's current state, so it never takes over another agent's pane
// or changes what the user sees. Everything else is read-only.

import { accessSync, constants, readFileSync } from "fs";
import * as path from "path";
import {
  DOCTOR_TIMEOUT_MS,
  describeSpawnFailure,
  runCommand,
  type CommandResult,
  type CommandRunner,
} from "../cli/diagnostics.js";
import { HerdrClient } from "../herdr/client.js";
import type { HerdrAgentState } from "../types/herdr.js";
import {
  herdrBin,
  readPluginContext,
  type HerdrAgentStatus,
  type HerdrPluginContext,
} from "./context.js";

export const GEMINI_AGENT = "gemini-cli";
export const EXTENSION_NAME = "herdr-gemini-cli";
export const MIN_NODE_MAJOR = 20;
/** Gemini takes a few seconds to start, so it gets a longer timeout. */
export const GEMINI_TIMEOUT_MS = 15000;

export const FIX_REINSTALL_EXTENSION =
  "run Gemini: reinstall extension (herdr-gemini-cli.reinstall-extension)";
export const FIX_UPDATE_PLUGIN = "run: herdr plugin update herdr-gemini-cli";

export interface PluginDoctorOptions {
  env?: NodeJS.ProcessEnv;
  run?: CommandRunner;
  out?: (line: string) => void;
  /**
   * Plugin checkout root (holds package.json and plugin/.paths). Defaults to
   * the cwd, which plugin/node.sh sets to the plugin root.
   */
  rootDir?: string;
  nodeExecPath?: string;
  nodeVersion?: string;
  timeoutMs?: number;
  geminiTimeoutMs?: number;
  /** Called at the end; resolves when the popup may close. */
  waitForKey?: () => Promise<void>;
}

export interface PluginDoctorSummary {
  failures: number;
  warnings: number;
  /** True when a test report-agent was sent to the focused pane. */
  reportSent: boolean;
}

/** An entry of `gemini extensions list`. */
export interface GeminiExtensionEntry {
  name: string;
  version: string;
  /** Leading status glyph, e.g. "✓" (enabled) or "✗" (disabled). */
  marker: string;
  source: string | null;
  type: string | null;
  ref: string | null;
  fields: Record<string, string>;
}

/** An agent from `herdr agent list`. */
export interface HerdrAgentEntry {
  pane_id: string;
  agent: string | null;
  agent_status: string;
  cwd: string | null;
}

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * Parses `gemini extensions list` (Gemini 0.68), which prints for each
 * extension a header line such as `✓ herdr-gemini-cli (0.1.0)` followed by
 * indented `Key: value` lines (`Source: <url> (Type: git)`, `Ref: <sha>`, ...).
 */
export function parseGeminiExtensions(output: string): GeminiExtensionEntry[] {
  const entries: GeminiExtensionEntry[] = [];
  let current: GeminiExtensionEntry | null = null;
  for (const rawLine of output.replace(ANSI, "").split(/\r?\n/)) {
    const header = /^(\S+)\s+(\S+)\s+\(([^)]*)\)\s*$/.exec(rawLine);
    if (header) {
      current = {
        marker: header[1],
        name: header[2],
        version: header[3],
        source: null,
        type: null,
        ref: null,
        fields: {},
      };
      entries.push(current);
      continue;
    }
    const field = /^\s+([^:]+):\s*(.*)$/.exec(rawLine);
    if (!current || !field) {
      continue;
    }
    const key = field[1].trim();
    const value = field[2].trim();
    current.fields[key] = value;
    if (key === "Source") {
      const typed = /^(.*?)\s*\(Type:\s*([^)]+)\)$/.exec(value);
      current.source = typed ? typed[1] : value;
      current.type = typed ? typed[2].trim() : null;
    } else if (key === "Ref") {
      current.ref = value;
    }
  }
  return entries;
}

/** Parses `herdr agent list` JSON. Returns null if it is not that shape. */
export function parseAgentList(output: string): HerdrAgentEntry[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return null;
  }
  const agents = (parsed as { result?: { agents?: unknown } } | null)?.result?.agents;
  if (!Array.isArray(agents)) {
    return null;
  }
  return agents
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
    .filter((a) => typeof a.pane_id === "string")
    .map((a) => ({
      pane_id: a.pane_id as string,
      agent: typeof a.agent === "string" ? a.agent : null,
      agent_status: typeof a.agent_status === "string" ? a.agent_status : "unknown",
      cwd: typeof a.cwd === "string" ? a.cwd : null,
    }));
}

/**
 * The state to re-report for a pane so the test report doesn't change what
 * the user sees. `done` is how Herdr shows an unseen idle. Returns null when
 * there is no safe state to report.
 */
export function reportStateFor(status: HerdrAgentStatus | string | null): HerdrAgentState | null {
  switch (status) {
    case "idle":
    case "done":
      return "idle";
    case "working":
    case "blocked":
      return status;
    default:
      return null;
  }
}

/** Parses the KEY=value lines of plugin/.paths. */
export function parsePathsFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match && match[2]) {
      result[match[1]] = match[2];
    }
  }
  return result;
}

function nodeMajor(version: string): number | null {
  const match = /^v?(\d+)\./.exec(version);
  return match ? Number(match[1]) : null;
}

function isExecutable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function firstLine(text: string | null | undefined): string {
  return (text ?? "").trim().split(/\r?\n/)[0] ?? "";
}

/**
 * Waits for one keypress on a TTY stdin (raw mode). Resolves immediately when
 * stdin isn't a TTY, so piped runs and tests never hang.
 */
export function waitForKeypress(stdin: NodeJS.ReadStream = process.stdin): Promise<void> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.once("data", () => {
      stdin.setRawMode(false);
      stdin.pause();
      resolve();
    });
  });
}

export async function runPluginDoctor(
  options: PluginDoctorOptions = {}
): Promise<PluginDoctorSummary> {
  const env = options.env ?? process.env;
  const run = options.run ?? runCommand;
  const out = options.out ?? ((line: string) => console.log(line));
  const rootDir = options.rootDir ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? DOCTOR_TIMEOUT_MS;
  const geminiTimeoutMs = options.geminiTimeoutMs ?? GEMINI_TIMEOUT_MS;
  const nodeExecPath = options.nodeExecPath ?? process.execPath;
  const nodeVersion = options.nodeVersion ?? process.version;
  const waitForKey = options.waitForKey ?? (() => waitForKeypress());

  const summary: PluginDoctorSummary = { failures: 0, warnings: 0, reportSent: false };
  const ok = (label: string, detail: string) => out(`✅ ${label}: ${detail}`);
  const info = (label: string, detail: string) => out(`➖ ${label}: ${detail}`);
  const warn = (label: string, detail: string, fix: string) => {
    summary.warnings++;
    out(`⚠️  ${label}: ${detail}`);
    out(`   Fix: ${fix}`);
  };
  const fail = (label: string, detail: string, fix: string) => {
    summary.failures++;
    out(`❌ ${label}: ${detail}`);
    out(`   Fix: ${fix}`);
  };
  const exec = (command: string, args: string[], ms: number): CommandResult => {
    try {
      return run(command, args, ms);
    } catch (err: unknown) {
      return {
        status: null,
        signal: null,
        stdout: "",
        stderr: "",
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  };

  const pkg = (() => {
    try {
      return JSON.parse(readText(path.join(rootDir, "package.json")) ?? "") as { version?: string };
    } catch {
      return {};
    }
  })();
  const pluginVersion = typeof pkg.version === "string" ? pkg.version : null;

  out(`=== Herdr Gemini CLI doctor${pluginVersion ? ` (plugin ${pluginVersion})` : ""} ===`);
  out("");

  // Invocation context: the pane underneath the popup.
  const ctx: HerdrPluginContext | null = readPluginContext(env);
  const paneId = ctx?.focused_pane_id ?? null;
  if (paneId) {
    info(
      "Focused pane",
      `${paneId} (agent: ${ctx?.focused_pane_agent ?? "none"}, status: ${ctx?.focused_pane_status ?? "unknown"})`
    );
  } else {
    info("Focused pane", "none (no HERDR_PLUGIN_CONTEXT_JSON); the test report will be skipped");
  }

  // Herdr binary.
  const bin = herdrBin(env);
  const herdrRes = exec(bin, ["--version"], timeoutMs);
  const herdrFailure = describeSpawnFailure(herdrRes, timeoutMs);
  if (herdrFailure) {
    fail(
      "Herdr",
      `${bin} --version failed: ${herdrFailure}`,
      "check that Herdr is installed and HERDR_BIN_PATH points at it, then restart the Herdr server"
    );
  } else {
    ok("Herdr", `${firstLine(herdrRes.stdout) || "found"} (${bin})`);
  }

  // Node running this doctor (the one plugin/node.sh picked).
  const major = nodeMajor(nodeVersion);
  if (major !== null && major < MIN_NODE_MAJOR) {
    warn(
      "Node.js",
      `${nodeVersion} at ${nodeExecPath} is older than ${MIN_NODE_MAJOR}`,
      `install Node.js ${MIN_NODE_MAJOR}+, then ${FIX_UPDATE_PLUGIN}`
    );
  } else {
    ok("Node.js", `${nodeVersion} (${nodeExecPath})`);
  }

  // Paths recorded by plugin/install-extension.sh.
  const pathsFile = path.resolve(rootDir, env.HGC_PATHS_FILE || path.join("plugin", ".paths"));
  const pathsContent = readText(pathsFile);
  if (pathsContent === null) {
    info(
      "Recorded paths",
      `${pathsFile} not found (expected for a \`herdr plugin link\`ed checkout); using PATH`
    );
  } else {
    const recorded = parsePathsFile(pathsContent);
    for (const key of ["GEMINI_BIN", "NODE_BIN"]) {
      const value = recorded[key];
      if (!value) {
        fail(`Recorded ${key}`, `missing from ${pathsFile}`, FIX_UPDATE_PLUGIN);
      } else if (!isExecutable(value)) {
        fail(`Recorded ${key}`, `${value} is not executable`, FIX_UPDATE_PLUGIN);
      } else {
        ok(`Recorded ${key}`, value);
      }
    }
  }

  // Socket reachability + registered agents (read-only).
  const listRes = exec(bin, ["agent", "list"], timeoutMs);
  const listFailure = describeSpawnFailure(listRes, timeoutMs);
  const agents = listFailure ? null : parseAgentList(listRes.stdout ?? "");
  const socketFix = `check that the Herdr server is running${
    env.HERDR_SOCKET_PATH ? ` (socket: ${env.HERDR_SOCKET_PATH})` : ""
  }`;
  if (listFailure) {
    fail("Herdr socket", `${bin} agent list failed: ${listFailure}`, socketFix);
  } else if (!agents) {
    fail("Herdr socket", `unexpected \`${bin} agent list\` output: ${firstLine(listRes.stdout)}`, socketFix);
  } else {
    ok("Herdr socket", `reachable${env.HERDR_SOCKET_PATH ? ` (${env.HERDR_SOCKET_PATH})` : ""}`);
    const gemini = agents.filter((a) => a.agent === GEMINI_AGENT);
    if (gemini.length === 0) {
      info("Gemini agents", "no panes are registered as gemini-cli agents");
    } else {
      ok("Gemini agents", `${gemini.length} pane${gemini.length === 1 ? "" : "s"}`);
      for (const a of gemini) {
        out(`     ${a.pane_id}  ${a.agent_status}${a.cwd ? `  ${a.cwd}` : ""}`);
      }
    }
  }

  // Test report: only to a pane that is already a gemini-cli agent, with its
  // current state, so no other agent's pane is ever taken over.
  const live = paneId && agents ? agents.find((a) => a.pane_id === paneId) : undefined;
  const liveAgent = live ? live.agent : ctx?.focused_pane_agent ?? null;
  const state = reportStateFor(live ? live.agent_status : ctx?.focused_pane_status ?? null);
  if (!paneId) {
    info("Test report", "skipped (no focused pane)");
  } else if (ctx?.focused_pane_agent !== GEMINI_AGENT || liveAgent !== GEMINI_AGENT) {
    info("Test report", `skipped (${paneId} is not a gemini-cli agent pane; checked read-only)`);
  } else if (!agents) {
    info("Test report", "skipped (Herdr socket unreachable)");
  } else if (!state) {
    info("Test report", `skipped (${paneId} has no reportable state)`);
  } else {
    const client = new HerdrClient({ env, paneId });
    const args = client.buildReportArgs({ state });
    const res = exec(bin, args, timeoutMs);
    summary.reportSent = true;
    const failure = describeSpawnFailure(res, timeoutMs);
    if (failure) {
      fail("Test report", `report-agent to ${paneId} failed: ${failure}`, socketFix);
    } else {
      ok("Test report", `delivered to ${paneId} (state: ${state})`);
    }
  }

  // Gemini CLI (slowest, so last).
  const geminiRes = exec("gemini", ["--version"], geminiTimeoutMs);
  const geminiFailure = describeSpawnFailure(geminiRes, geminiTimeoutMs);
  if (geminiFailure) {
    fail(
      "Gemini CLI",
      `gemini --version failed: ${geminiFailure}`,
      `install Gemini CLI (https://github.com/google-gemini/gemini-cli), then ${FIX_UPDATE_PLUGIN}`
    );
  } else {
    ok("Gemini CLI", firstLine(geminiRes.stdout) || "found");

    const extRes = exec("gemini", ["extensions", "list"], geminiTimeoutMs);
    const extFailure = describeSpawnFailure(extRes, geminiTimeoutMs);
    if (extFailure) {
      fail("Gemini extension", `gemini extensions list failed: ${extFailure}`, FIX_REINSTALL_EXTENSION);
    } else {
      const ext = parseGeminiExtensions(`${extRes.stdout ?? ""}\n${extRes.stderr ?? ""}`).find(
        (e) => e.name === EXTENSION_NAME
      );
      if (!ext) {
        fail("Gemini extension", `${EXTENSION_NAME} is not installed`, FIX_REINSTALL_EXTENSION);
      } else {
        const details = [
          ext.version,
          ext.type ? `type: ${ext.type}` : null,
          ext.ref ? `ref: ${ext.ref}` : null,
          ext.source ? `source: ${ext.source}` : null,
        ]
          .filter(Boolean)
          .join(", ");
        if (ext.marker !== "✓") {
          fail("Gemini extension", `${EXTENSION_NAME} is disabled (${details})`, `run: gemini extensions enable ${EXTENSION_NAME}`);
        } else if (pluginVersion && ext.version !== pluginVersion) {
          fail(
            "Gemini extension",
            `${EXTENSION_NAME} ${ext.version} does not match plugin ${pluginVersion} (${details})`,
            FIX_REINSTALL_EXTENSION
          );
        } else {
          ok("Gemini extension", `${EXTENSION_NAME} ${details}`);
        }
      }
    }
  }

  out("");
  if (summary.failures === 0 && summary.warnings === 0) {
    out("All checks passed.");
  } else {
    out(`${summary.failures} problem(s), ${summary.warnings} warning(s) found.`);
  }
  out("Press any key to close");
  await waitForKey();
  return summary;
}
