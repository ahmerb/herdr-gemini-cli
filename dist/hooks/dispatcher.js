"use strict";

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

// src/hooks/dispatcher.ts
void runHook();
//# sourceMappingURL=dispatcher.js.map