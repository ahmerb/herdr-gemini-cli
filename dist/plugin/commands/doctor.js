"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/plugin/commands/doctor.ts
var path2 = __toESM(require("path"));

// src/plugin/doctor.ts
var import_fs = require("fs");
var path = __toESM(require("path"));

// src/herdr/client.ts
var import_child_process = require("child_process");
var HerdrClient = class {
  agentName;
  sourceId;
  execTimeoutMs;
  env;
  paneIdOverride;
  lastSeq = 0;
  constructor(config) {
    this.env = config?.env ?? process.env;
    this.agentName = config?.agentName ?? "gemini-cli";
    this.sourceId = config?.sourceId ?? "gemini-cli";
    this.execTimeoutMs = config?.execTimeoutMs ?? 1e3;
    this.paneIdOverride = config?.paneId || null;
  }
  getEnvironment() {
    const isHerdr = this.env.HERDR_ENV === "1";
    const paneId = this.paneIdOverride ?? (this.env.HERDR_PANE_ID || null);
    const binPath = this.env.HERDR_BIN_PATH || null;
    const socketPath = this.env.HERDR_SOCKET_PATH || null;
    return {
      isHerdr: Boolean(isHerdr && paneId && binPath),
      paneId,
      binPath,
      socketPath
    };
  }
  isHerdrActive() {
    return this.getEnvironment().isHerdr;
  }
  nextSeq() {
    const nowMicro = Date.now() * 1e3;
    if (nowMicro <= this.lastSeq) {
      this.lastSeq = this.lastSeq + 1;
    } else {
      this.lastSeq = nowMicro;
    }
    return this.lastSeq;
  }
  buildResumeCommand(sessionId) {
    const sanitizedId = (sessionId || "").trim();
    if (!sanitizedId || /['\x00-\x1f\x7f]/.test(sanitizedId)) {
      return ["gemini"];
    }
    return ["gemini", "--resume", sanitizedId];
  }
  buildReportArgs(options) {
    const env = this.getEnvironment();
    if (!env.paneId) {
      throw new Error("Missing HERDR_PANE_ID");
    }
    const seq = options.seq ?? this.nextSeq();
    const args = [
      "pane",
      "report-agent",
      env.paneId,
      "--source",
      this.sourceId,
      "--agent",
      this.agentName,
      "--state",
      options.state,
      "--seq",
      String(seq)
    ];
    if (options.message) {
      args.push("--message", options.message);
    }
    if (options.sessionId) {
      args.push("--agent-session-id", options.sessionId);
    }
    if (options.resumeArgv && options.resumeArgv.length > 0) {
      args.push("--", ...options.resumeArgv);
    }
    return args;
  }
  buildReleaseArgs(options) {
    const env = this.getEnvironment();
    if (!env.paneId) {
      throw new Error("Missing HERDR_PANE_ID");
    }
    const seq = options?.seq ?? this.nextSeq();
    return [
      "pane",
      "release-agent",
      env.paneId,
      "--source",
      this.sourceId,
      "--agent",
      this.agentName,
      "--seq",
      String(seq)
    ];
  }
  async reportAgent(options) {
    if (!this.isHerdrActive()) {
      return false;
    }
    try {
      const args = this.buildReportArgs(options);
      await this.execHerdr(args);
      return true;
    } catch {
      return false;
    }
  }
  async releaseAgent(options) {
    if (!this.isHerdrActive()) {
      return false;
    }
    try {
      const args = this.buildReleaseArgs(options);
      await this.execHerdr(args);
      return true;
    } catch {
      return false;
    }
  }
  execHerdr(args) {
    const env = this.getEnvironment();
    const binPath = env.binPath;
    if (!binPath) {
      return Promise.resolve();
    }
    return new Promise((resolve3) => {
      try {
        const options = {
          stdio: "ignore",
          detached: false,
          timeout: this.execTimeoutMs
        };
        const child = (0, import_child_process.spawn)(binPath, args, options);
        child.on("error", () => resolve3());
        child.on("close", () => resolve3());
      } catch {
        resolve3();
      }
    });
  }
};

// src/cli/diagnostics.ts
var import_child_process2 = require("child_process");
var DOCTOR_TIMEOUT_MS = 5e3;
var runCommand = (command, args, timeoutMs) => (0, import_child_process2.spawnSync)(command, args, {
  encoding: "utf8",
  timeout: timeoutMs,
  stdio: ["ignore", "pipe", "pipe"]
});
function describeSpawnFailure(res, timeoutMs) {
  if (res.error) {
    const code = res.error.code;
    if (code === "ETIMEDOUT") {
      return `timed out after ${timeoutMs}ms`;
    }
    return res.error.message;
  }
  if (res.signal) {
    return `killed by signal ${res.signal}`;
  }
  if (res.status !== 0) {
    const stderr = (res.stderr ?? "").trim();
    return `exited with code ${res.status}${stderr ? `: ${stderr}` : ""}`;
  }
  return null;
}

// src/plugin/context.ts
var STRING_FIELDS = [
  "focused_pane_id",
  "focused_pane_agent",
  "focused_pane_cwd",
  "workspace_id",
  "workspace_label",
  "workspace_cwd",
  "tab_id",
  "tab_label",
  "invocation_source",
  "correlation_id",
  "selected_text",
  "clicked_url",
  "link_handler_id"
];
var AGENT_STATUSES = /* @__PURE__ */ new Set([
  "idle",
  "working",
  "blocked",
  "done",
  "unknown"
]);
function stringOrNull(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function readPluginContext(env = process.env) {
  const raw = env.HERDR_PLUGIN_CONTEXT_JSON;
  if (!raw) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed;
  const context = {};
  for (const field of STRING_FIELDS) {
    context[field] = stringOrNull(obj[field]);
  }
  const status = stringOrNull(obj.focused_pane_status);
  context.focused_pane_status = status && AGENT_STATUSES.has(status) ? status : null;
  return context;
}
function herdrBin(env = process.env) {
  return env.HERDR_BIN_PATH || "herdr";
}

// src/plugin/doctor.ts
var GEMINI_AGENT = "gemini-cli";
var EXTENSION_NAME = "herdr-gemini-cli";
var MIN_NODE_MAJOR = 20;
var GEMINI_TIMEOUT_MS = 15e3;
var FIX_REINSTALL_EXTENSION = "run Gemini: reinstall extension (herdr-gemini-cli.reinstall-extension)";
var FIX_UPDATE_PLUGIN = "run: herdr plugin update herdr-gemini-cli";
var ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
function parseGeminiExtensions(output) {
  const entries = [];
  let current = null;
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
        fields: {}
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
function parseAgentList(output) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return null;
  }
  const agents = parsed?.result?.agents;
  if (!Array.isArray(agents)) {
    return null;
  }
  return agents.filter((a) => typeof a === "object" && a !== null).filter((a) => typeof a.pane_id === "string").map((a) => ({
    pane_id: a.pane_id,
    agent: typeof a.agent === "string" ? a.agent : null,
    agent_status: typeof a.agent_status === "string" ? a.agent_status : "unknown",
    cwd: typeof a.cwd === "string" ? a.cwd : null
  }));
}
function reportStateFor(status) {
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
function parsePathsFile(content) {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match && match[2]) {
      result[match[1]] = match[2];
    }
  }
  return result;
}
function nodeMajor(version) {
  const match = /^v?(\d+)\./.exec(version);
  return match ? Number(match[1]) : null;
}
function isExecutable(file) {
  try {
    (0, import_fs.accessSync)(file, import_fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function readText(file) {
  try {
    return (0, import_fs.readFileSync)(file, "utf8");
  } catch {
    return null;
  }
}
function firstLine(text) {
  return (text ?? "").trim().split(/\r?\n/)[0] ?? "";
}
function waitForKeypress(stdin = process.stdin) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.resolve();
  }
  return new Promise((resolve3) => {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.once("data", () => {
      stdin.setRawMode(false);
      stdin.pause();
      resolve3();
    });
  });
}
async function runPluginDoctor(options = {}) {
  const env = options.env ?? process.env;
  const run = options.run ?? runCommand;
  const out = options.out ?? ((line) => console.log(line));
  const rootDir = options.rootDir ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? DOCTOR_TIMEOUT_MS;
  const geminiTimeoutMs = options.geminiTimeoutMs ?? GEMINI_TIMEOUT_MS;
  const nodeExecPath = options.nodeExecPath ?? process.execPath;
  const nodeVersion = options.nodeVersion ?? process.version;
  const waitForKey = options.waitForKey ?? (() => waitForKeypress());
  const summary = { failures: 0, warnings: 0, reportSent: false };
  const ok = (label, detail) => out(`\u2705 ${label}: ${detail}`);
  const info = (label, detail) => out(`\u2796 ${label}: ${detail}`);
  const warn = (label, detail, fix) => {
    summary.warnings++;
    out(`\u26A0\uFE0F  ${label}: ${detail}`);
    out(`   Fix: ${fix}`);
  };
  const fail = (label, detail, fix) => {
    summary.failures++;
    out(`\u274C ${label}: ${detail}`);
    out(`   Fix: ${fix}`);
  };
  const exec = (command, args, ms) => {
    try {
      return run(command, args, ms);
    } catch (err) {
      return {
        status: null,
        signal: null,
        stdout: "",
        stderr: "",
        error: err instanceof Error ? err : new Error(String(err))
      };
    }
  };
  const pkg = (() => {
    try {
      return JSON.parse(readText(path.join(rootDir, "package.json")) ?? "");
    } catch {
      return {};
    }
  })();
  const pluginVersion = typeof pkg.version === "string" ? pkg.version : null;
  out(`=== Herdr Gemini CLI doctor${pluginVersion ? ` (plugin ${pluginVersion})` : ""} ===`);
  out("");
  const ctx = readPluginContext(env);
  const paneId = ctx?.focused_pane_id ?? null;
  if (paneId) {
    info(
      "Focused pane",
      `${paneId} (agent: ${ctx?.focused_pane_agent ?? "none"}, status: ${ctx?.focused_pane_status ?? "unknown"})`
    );
  } else {
    info("Focused pane", "none (no HERDR_PLUGIN_CONTEXT_JSON); the test report will be skipped");
  }
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
  const listRes = exec(bin, ["agent", "list"], timeoutMs);
  const listFailure = describeSpawnFailure(listRes, timeoutMs);
  const agents = listFailure ? null : parseAgentList(listRes.stdout ?? "");
  const socketFix = `check that the Herdr server is running${env.HERDR_SOCKET_PATH ? ` (socket: ${env.HERDR_SOCKET_PATH})` : ""}`;
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
  const live = paneId && agents ? agents.find((a) => a.pane_id === paneId) : void 0;
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
      const ext = parseGeminiExtensions(`${extRes.stdout ?? ""}
${extRes.stderr ?? ""}`).find(
        (e) => e.name === EXTENSION_NAME
      );
      if (!ext) {
        fail("Gemini extension", `${EXTENSION_NAME} is not installed`, FIX_REINSTALL_EXTENSION);
      } else {
        const details = [
          ext.version,
          ext.type ? `type: ${ext.type}` : null,
          ext.ref ? `ref: ${ext.ref}` : null,
          ext.source ? `source: ${ext.source}` : null
        ].filter(Boolean).join(", ");
        if (ext.marker !== "\u2713") {
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

// src/plugin/commands/doctor.ts
runPluginDoctor({ rootDir: path2.resolve(__dirname, "..", "..", "..") }).catch((err) => {
  console.error(`herdr-gemini-cli doctor failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
//# sourceMappingURL=doctor.js.map