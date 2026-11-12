export type HerdrAgentState = "working" | "idle" | "blocked";

export interface HerdrEnvironment {
  isHerdr: boolean;
  paneId: string | null;
  binPath: string | null;
  socketPath: string | null;
}

export interface ReportAgentOptions {
  state: HerdrAgentState;
  message?: string;
  sessionId?: string;
  resumeArgv?: string[];
  seq?: number;
}

export interface ReleaseAgentOptions {
  seq?: number;
}

export interface HerdrClientConfig {
  agentName?: string;
  sourceId?: string;
  execTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}
