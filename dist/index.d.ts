export { readStdin, runHook } from './hooks/dispatcher.js';
export { runDoctor } from './cli/doctor.js';

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

declare function handleHook(input: GeminiHookInput, client?: HerdrClient): Promise<GeminiHookOutput>;

export { type AfterAgentInput, type AfterToolInput, type BaseHookInput, type BeforeAgentInput, type BeforeToolInput, type GeminiHookInput, type GeminiHookOutput, type HerdrAgentState, HerdrClient, type HerdrClientConfig, type HerdrEnvironment, type HookEventName, type NotificationInput, type ReleaseAgentOptions, type ReportAgentOptions, type SessionEndInput, type SessionStartInput, handleHook };
