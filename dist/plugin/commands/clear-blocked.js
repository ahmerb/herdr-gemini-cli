"use strict";

// src/plugin/clear-blocked.ts
var import_child_process2 = require("child_process");

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

// src/plugin/clear-blocked.ts
var GEMINI_AGENT = "gemini-cli";
var PREFIX = "herdr-gemini-cli clear-blocked:";
function parseAgentSessionId(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const session = parsed?.result?.agent?.agent_session;
  if (!session || session.agent !== GEMINI_AGENT || session.kind !== "id" || typeof session.value !== "string" || session.value.length === 0) {
    return null;
  }
  return session.value;
}
function lookupSessionIdWithHerdr(paneId, env) {
  return new Promise((resolve) => {
    try {
      (0, import_child_process2.execFile)(
        herdrBin(env),
        ["agent", "get", paneId],
        { env, timeout: 2e3, encoding: "utf8" },
        (error, stdout) => resolve(error ? null : parseAgentSessionId(stdout))
      );
    } catch {
      resolve(null);
    }
  });
}
async function clearBlocked(deps = {}) {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((message) => console.log(message));
  const createClient = deps.createClient ?? ((paneId2, clientEnv) => new HerdrClient({ paneId: paneId2, env: clientEnv }));
  const lookupSessionId = deps.lookupSessionId ?? lookupSessionIdWithHerdr;
  const context = readPluginContext(env);
  if (!context) {
    log(`${PREFIX} no valid HERDR_PLUGIN_CONTEXT_JSON; nothing to do.`);
    return "no-context";
  }
  const paneId = context.focused_pane_id;
  if (!paneId) {
    log(`${PREFIX} no focused pane in the plugin context; nothing to do.`);
    return "no-pane";
  }
  if (context.focused_pane_agent !== GEMINI_AGENT) {
    log(
      `${PREFIX} pane ${paneId} is not a Gemini pane (agent: ${context.focused_pane_agent ?? "none"}); nothing to do.`
    );
    return "not-gemini";
  }
  if (context.focused_pane_status !== "blocked") {
    log(
      `${PREFIX} pane ${paneId} is not blocked (status: ${context.focused_pane_status ?? "unknown"}); nothing to do.`
    );
    return "not-blocked";
  }
  const client = createClient(paneId, env);
  if (!client.isHerdrActive()) {
    log(`${PREFIX} not running inside Herdr (HERDR_ENV/HERDR_BIN_PATH missing); nothing to do.`);
    return "not-herdr";
  }
  const sessionId = await lookupSessionId(paneId, env);
  const reported = await client.reportAgent({
    state: "idle",
    ...sessionId ? { sessionId } : {}
  });
  if (!reported) {
    log(`${PREFIX} failed to report pane ${paneId} idle.`);
    return "report-failed";
  }
  log(`${PREFIX} pane ${paneId} reported idle${sessionId ? ` (session ${sessionId})` : ""}.`);
  return "cleared";
}

// src/plugin/commands/clear-blocked.ts
void clearBlocked().catch((error) => {
  console.error(`herdr-gemini-cli clear-blocked: ${String(error)}`);
  process.exitCode = 1;
});
//# sourceMappingURL=clear-blocked.js.map