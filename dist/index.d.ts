import { SpawnSyncReturns } from 'child_process';

type HookEventName = "SessionStart" | "SessionEnd" | "BeforeAgent" | "AfterAgent" | "BeforeModel" | "AfterModel" | "BeforeToolSelection" | "BeforeTool" | "AfterTool" | "Notification";
interface BaseHookInput {
    session_id: string;
    transcript_path: string;
    cwd: string;
    hook_event_name: HookEventName;
    timestamp: string;
}
interface SessionStartInput extends BaseHookInput {
    hook_event_name: "SessionStart";
    source: "startup" | "resume" | "clear";
}
interface SessionEndInput extends BaseHookInput {
    hook_event_name: "SessionEnd";
    reason: "exit" | "clear" | "logout" | "prompt_input_exit" | "other";
}
interface BeforeAgentInput extends BaseHookInput {
    hook_event_name: "BeforeAgent";
    prompt: string;
}
interface AfterAgentInput extends BaseHookInput {
    hook_event_name: "AfterAgent";
    prompt: string;
    prompt_response: string;
    stop_hook_active?: boolean;
}
interface BeforeToolInput extends BaseHookInput {
    hook_event_name: "BeforeTool";
    tool_name: string;
    tool_input?: Record<string, unknown>;
    mcp_context?: Record<string, unknown>;
    original_request_name?: string;
}
interface AfterToolInput extends BaseHookInput {
    hook_event_name: "AfterTool";
    tool_name: string;
    tool_input?: Record<string, unknown>;
    tool_response?: {
        llmContent?: unknown;
        returnDisplay?: unknown;
        error?: unknown;
    };
    mcp_context?: Record<string, unknown>;
    original_request_name?: string;
}
interface NotificationInput extends BaseHookInput {
    hook_event_name: "Notification";
    notification_type: "ToolPermission" | string;
    message?: string;
    details?: Record<string, unknown>;
}
type GeminiHookInput = SessionStartInput | SessionEndInput | BeforeAgentInput | AfterAgentInput | BeforeToolInput | AfterToolInput | NotificationInput | (BaseHookInput & Record<string, unknown>);
interface GeminiHookOutput {
    decision?: "allow" | "deny" | "block";
    reason?: string;
    systemMessage?: string;
    suppressOutput?: boolean;
    continue?: boolean;
    stopReason?: string;
    hookSpecificOutput?: Record<string, unknown>;
}

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
    /**
     * Pane to report on. Defaults to `HERDR_PANE_ID`. Herdr plugin commands set
     * this from the plugin invocation context, because popups (and actions run
     * from the CLI) do not target the pane in `HERDR_PANE_ID`.
     */
    paneId?: string;
}

declare class HerdrClient {
    readonly agentName: string;
    readonly sourceId: string;
    readonly execTimeoutMs: number;
    private readonly env;
    private readonly paneIdOverride;
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

declare function handleHook(input: GeminiHookInput, client?: HerdrClient): Promise<GeminiHookOutput>;

declare function readStdin(): Promise<string>;
declare function runHook(): Promise<void>;

/** Upper bound for each Herdr invocation the doctor makes. */
declare const DOCTOR_TIMEOUT_MS = 5000;
/** The parts of a spawnSync result the doctors look at. */
type CommandResult = Pick<SpawnSyncReturns<string>, "status" | "signal" | "stdout" | "stderr" | "error">;
/** Runs a command to completion; injectable so doctors can be unit tested. */
type CommandRunner = (command: string, args: string[], timeoutMs: number) => CommandResult;
/**
 * Default CommandRunner: spawnSync with a timeout and no stdin, so a child
 * can never wait on (or steal) the terminal's input.
 */
declare const runCommand: CommandRunner;
interface DoctorOptions {
    client?: HerdrClient;
    timeoutMs?: number;
}
/**
 * Returns a human-readable description of why a spawnSync call failed, or
 * null if the process ran and exited with status 0.
 */
declare function describeSpawnFailure(res: CommandResult, timeoutMs: number): string | null;
declare function runDoctor(options?: DoctorOptions): void;

/** Herdr's effective agent status for a pane. */
type HerdrAgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";
interface HerdrPluginContext {
    focused_pane_id: string | null;
    focused_pane_agent: string | null;
    focused_pane_status: HerdrAgentStatus | null;
    focused_pane_cwd: string | null;
    workspace_id: string | null;
    workspace_label: string | null;
    workspace_cwd: string | null;
    tab_id: string | null;
    tab_label: string | null;
    invocation_source: string | null;
    correlation_id: string | null;
    selected_text: string | null;
    clicked_url: string | null;
    link_handler_id: string | null;
}
/**
 * Parses HERDR_PLUGIN_CONTEXT_JSON. Returns null when the variable is missing,
 * is not valid JSON, or is not a JSON object. Fields with unexpected types are
 * treated as absent rather than failing the whole context.
 */
declare function readPluginContext(env?: NodeJS.ProcessEnv): HerdrPluginContext | null;
/** Command to run Herdr with (`HERDR_BIN_PATH`, set by Herdr). */
declare function herdrBin(env?: NodeJS.ProcessEnv): string;

export { type AfterAgentInput, type AfterToolInput, type BaseHookInput, type BeforeAgentInput, type BeforeToolInput, type CommandResult, type CommandRunner, DOCTOR_TIMEOUT_MS, type DoctorOptions, type GeminiHookInput, type GeminiHookOutput, type HerdrAgentState, type HerdrAgentStatus, HerdrClient, type HerdrClientConfig, type HerdrEnvironment, type HerdrPluginContext, type HookEventName, type NotificationInput, type ReleaseAgentOptions, type ReportAgentOptions, type SessionEndInput, type SessionStartInput, describeSpawnFailure, handleHook, herdrBin, readPluginContext, readStdin, runCommand, runDoctor, runHook };
