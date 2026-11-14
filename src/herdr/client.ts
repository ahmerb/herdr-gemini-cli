import { spawn, type ChildProcess, type SpawnOptions } from "child_process";
import {
  HerdrAgentState,
  HerdrClientConfig,
  HerdrEnvironment,
  ReleaseAgentOptions,
  ReportAgentOptions,
} from "../types/herdr.js";

export class HerdrClient {
  public readonly agentName: string;
  public readonly sourceId: string;
  public readonly execTimeoutMs: number;
  private readonly env: NodeJS.ProcessEnv;
  private readonly paneIdOverride: string | null;
  private lastSeq: number = 0;

  constructor(config?: HerdrClientConfig) {
    this.env = config?.env ?? process.env;
    this.agentName = config?.agentName ?? "gemini-cli";
    this.sourceId = config?.sourceId ?? "gemini-cli";
    this.execTimeoutMs = config?.execTimeoutMs ?? 1000;
    this.paneIdOverride = config?.paneId || null;
  }

  public getEnvironment(): HerdrEnvironment {
    const isHerdr = this.env.HERDR_ENV === "1";
    const paneId = this.paneIdOverride ?? (this.env.HERDR_PANE_ID || null);
    const binPath = this.env.HERDR_BIN_PATH || null;
    const socketPath = this.env.HERDR_SOCKET_PATH || null;

    return {
      isHerdr: Boolean(isHerdr && paneId && binPath),
      paneId,
      binPath,
      socketPath,
    };
  }

  public isHerdrActive(): boolean {
    return this.getEnvironment().isHerdr;
  }

  public nextSeq(): number {
    // Generate strictly monotonically increasing sequence number (microseconds base)
    const nowMicro = Date.now() * 1000;
    if (nowMicro <= this.lastSeq) {
      this.lastSeq = this.lastSeq + 1;
    } else {
      this.lastSeq = nowMicro;
    }
    return this.lastSeq;
  }

  public buildResumeCommand(sessionId: string): string[] {
    const sanitizedId = (sessionId || "").trim();
    if (!sanitizedId || /['\x00-\x1f\x7f]/.test(sanitizedId)) {
      return ["gemini"];
    }
    return ["gemini", "--resume", sanitizedId];
  }

  public buildReportArgs(options: ReportAgentOptions): string[] {
    const env = this.getEnvironment();
    if (!env.paneId) {
      throw new Error("Missing HERDR_PANE_ID");
    }

    const seq = options.seq ?? this.nextSeq();
    const args: string[] = [
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
      String(seq),
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

  public buildReleaseArgs(options?: ReleaseAgentOptions): string[] {
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
      String(seq),
    ];
  }

  public async reportAgent(options: ReportAgentOptions): Promise<boolean> {
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

  public async releaseAgent(options?: ReleaseAgentOptions): Promise<boolean> {
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

  private execHerdr(args: string[]): Promise<void> {
    const env = this.getEnvironment();
    const binPath = env.binPath;
    if (!binPath) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      try {
        const options: SpawnOptions = {
          stdio: "ignore",
          detached: false,
          timeout: this.execTimeoutMs,
        };
        const child: ChildProcess = spawn(binPath, args, options);

        child.on("error", () => resolve());
        child.on("close", () => resolve());
      } catch {
        resolve();
      }
    });
  }
}
