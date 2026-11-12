import { SpawnSyncReturns } from 'child_process';

type HerdrAgentState = "working" | "idle" | "blocked";
interface HerdrEnvironment {
    isHerdr: boolean;
    paneId: string | null;
    binPath: string | null;
    socketPath: string | null;
}
interface ReportAgentOptions {
    state: HerdrAgentState;
    message?: string;
    sessionId?: string;
    resumeArgv?: string[];
    seq?: number;
}
interface ReleaseAgentOptions {
    seq?: number;
}
interface HerdrClientConfig {
    agentName?: string;
    sourceId?: string;
    execTimeoutMs?: number;
    env?: NodeJS.ProcessEnv;
}

declare class HerdrClient {
    readonly agentName: string;
    readonly sourceId: string;
    readonly execTimeoutMs: number;
    private readonly env;
    private lastSeq;
    constructor(config?: HerdrClientConfig);
    getEnvironment(): HerdrEnvironment;
    isHerdrActive(): boolean;
    nextSeq(): number;
    buildResumeCommand(sessionId: string): string[];
    buildReportArgs(options: ReportAgentOptions): string[];
    buildReleaseArgs(options?: ReleaseAgentOptions): string[];
    reportAgent(options: ReportAgentOptions): Promise<boolean>;
    releaseAgent(options?: ReleaseAgentOptions): Promise<boolean>;
    private execHerdr;
}

/** Upper bound for each Herdr invocation the doctor makes. */
declare const DOCTOR_TIMEOUT_MS = 5000;
interface DoctorOptions {
    client?: HerdrClient;
    timeoutMs?: number;
}
/**
 * Returns a human-readable description of why a spawnSync call failed, or
 * null if the process ran and exited with status 0.
 */
declare function describeSpawnFailure(res: SpawnSyncReturns<string>, timeoutMs: number): string | null;
declare function runDoctor(options?: DoctorOptions): void;

export { DOCTOR_TIMEOUT_MS as D, HerdrClient as H, type ReleaseAgentOptions as R, type DoctorOptions as a, type HerdrAgentState as b, type HerdrClientConfig as c, type HerdrEnvironment as d, type ReportAgentOptions as e, describeSpawnFailure as f, runDoctor as r };
