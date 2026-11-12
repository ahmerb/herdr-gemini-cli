"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  DOCTOR_TIMEOUT_MS: () => DOCTOR_TIMEOUT_MS,
  HerdrClient: () => HerdrClient,
  describeSpawnFailure: () => describeSpawnFailure,
  handleHook: () => handleHook,
  readStdin: () => readStdin,
  runDoctor: () => runDoctor,
  runHook: () => runHook
});
module.exports = __toCommonJS(index_exports);

// src/herdr/client.ts
var import_child_process = require("child_process");
var HerdrClient = class {
  agentName;
  sourceId;
  execTimeoutMs;
  env;
  lastSeq = 0;
  constructor(config) {
    this.env = config?.env ?? process.env;
    this.agentName = config?.agentName ?? "gemini-cli";
    this.sourceId = config?.sourceId ?? "gemini-cli";
    this.execTimeoutMs = config?.execTimeoutMs ?? 1e3;
  }
  getEnvironment() {
    const isHerdr = this.env.HERDR_ENV === "1";
    const paneId = this.env.HERDR_PANE_ID || null;
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
    return new Promise((resolve) => {
      try {
        const options = {
          stdio: "ignore",
          detached: false,
          timeout: this.execTimeoutMs
        };
        const child = (0, import_child_process.spawn)(binPath, args, options);
        child.on("error", () => resolve());
        child.on("close", () => resolve());
      } catch {
        resolve();
      }
    });
  }
};

// src/hooks/handler.ts
async function handleHook(input, client = new HerdrClient()) {
  if (!client.isHerdrActive()) {
    return {};
  }
  const eventName = input.hook_event_name;
  const sessionId = input.session_id;
  switch (eventName) {
    case "SessionStart": {
      const resumeArgv = client.buildResumeCommand(sessionId);
      await client.reportAgent({
        state: "idle",
        sessionId,
        resumeArgv
      });
      break;
    }
    case "BeforeAgent": {
      await client.reportAgent({
        state: "working",
        sessionId
      });
      break;
    }
    case "Notification": {
      const notifInput = input;
      if (notifInput.notification_type === "ToolPermission") {
        const toolName = typeof notifInput.details?.tool_name === "string" && notifInput.details.tool_name || "action";
        const message = notifInput.message || `Waiting for approval to run ${toolName}`;
        await client.reportAgent({
          state: "blocked",
          message,
          sessionId
        });
      }
      break;
    }
    case "BeforeTool": {
      await client.reportAgent({
        state: "working",
        sessionId
      });
      break;
    }
    case "AfterAgent": {
      await client.reportAgent({
        state: "idle",
        sessionId
      });
      break;
    }
    case "SessionEnd": {
      await client.releaseAgent();
      break;
    }
    default:
      break;
  }
  return {};
}

// src/hooks/runner.ts
async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", () => {
      resolve("");
    });
  });
}
async function runHook() {
  try {
    const rawInput = await readStdin();
    if (!rawInput.trim()) {
      process.stdout.write(JSON.stringify({}) + "\n");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(rawInput);
    } catch {
      process.stdout.write(JSON.stringify({}) + "\n");
      return;
    }
    const output = await handleHook(parsed);
    process.stdout.write(JSON.stringify(output ?? {}) + "\n");
  } catch {
    process.stdout.write(JSON.stringify({}) + "\n");
  }
}

// src/cli/diagnostics.ts
var import_child_process2 = require("child_process");
var DOCTOR_TIMEOUT_MS = 5e3;
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
function runDoctor(options = {}) {
  const client = options.client ?? new HerdrClient();
  const timeoutMs = options.timeoutMs ?? DOCTOR_TIMEOUT_MS;
  const env = client.getEnvironment();
  console.log("=== Herdr Gemini CLI Integration Doctor ===\n");
  console.log(`HERDR_ENV:          ${process.env.HERDR_ENV ?? "(not set)"}`);
  console.log(`HERDR_PANE_ID:      ${env.paneId ?? "(not set)"}`);
  console.log(`HERDR_BIN_PATH:     ${env.binPath ?? "(not set)"}`);
  console.log(`HERDR_SOCKET_PATH:   ${env.socketPath ?? "(not set)"}`);
  console.log(`Herdr Status:       ${env.isHerdr ? "ACTIVE (Running inside Herdr)" : "DORMANT (Outside Herdr)"}
`);
  if (!env.isHerdr || !env.binPath) {
    console.log("Status: The integration is currently dormant.");
    console.log("Note: This is expected when running Gemini CLI outside of a Herdr pane.");
    console.log("To use Herdr integration, start Gemini CLI inside a Herdr managed pane.");
    return;
  }
  const binPath = env.binPath;
  console.log("Herdr binary check:");
  try {
    const res = (0, import_child_process2.spawnSync)(binPath, ["--version"], {
      encoding: "utf8",
      timeout: timeoutMs
    });
    const failure = describeSpawnFailure(res, timeoutMs);
    if (failure) {
      console.log(`  \u274C Failed to execute ${binPath}: ${failure}`);
    } else {
      console.log(`  \u2705 ${(res.stdout ?? "").trim() || "Herdr binary accessible"}`);
    }
  } catch (err) {
    console.log(`  \u274C Failed to check Herdr binary: ${err instanceof Error ? err.message : String(err)}`);
  }
  console.log("\nTesting agent report ping (state: idle)...");
  try {
    const testSeq = client.nextSeq();
    const args = client.buildReportArgs({
      state: "idle",
      seq: testSeq
    });
    console.log(`  Executing: ${binPath} ${args.join(" ")}`);
    const reportRes = (0, import_child_process2.spawnSync)(binPath, args, {
      encoding: "utf8",
      timeout: timeoutMs
    });
    const failure = describeSpawnFailure(reportRes, timeoutMs);
    if (failure) {
      console.log(`  \u26A0\uFE0F Test report failed: ${failure}`);
    } else {
      console.log("  \u2705 Test report delivered successfully to Herdr!");
    }
  } catch (err) {
    console.log(`  \u274C Error testing report: ${err instanceof Error ? err.message : String(err)}`);
  }
  console.log("\nDoctor check completed.");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DOCTOR_TIMEOUT_MS,
  HerdrClient,
  describeSpawnFailure,
  handleHook,
  readStdin,
  runDoctor,
  runHook
});
//# sourceMappingURL=index.js.map