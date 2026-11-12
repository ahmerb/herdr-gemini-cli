export type HookEventName =
  | "SessionStart"
  | "SessionEnd"
  | "BeforeAgent"
  | "AfterAgent"
  | "BeforeModel"
  | "AfterModel"
  | "BeforeToolSelection"
  | "BeforeTool"
  | "AfterTool"
  | "Notification";

export interface BaseHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: HookEventName;
  timestamp: string;
}

export interface SessionStartInput extends BaseHookInput {
  hook_event_name: "SessionStart";
  source: "startup" | "resume" | "clear";
}

export interface SessionEndInput extends BaseHookInput {
  hook_event_name: "SessionEnd";
  reason: "exit" | "clear" | "logout" | "prompt_input_exit" | "other";
}

export interface BeforeAgentInput extends BaseHookInput {
  hook_event_name: "BeforeAgent";
  prompt: string;
}

export interface AfterAgentInput extends BaseHookInput {
  hook_event_name: "AfterAgent";
  prompt: string;
  prompt_response: string;
  stop_hook_active?: boolean;
}

export interface BeforeToolInput extends BaseHookInput {
  hook_event_name: "BeforeTool";
  tool_name: string;
  tool_input?: Record<string, unknown>;
  mcp_context?: Record<string, unknown>;
  original_request_name?: string;
}

export interface AfterToolInput extends BaseHookInput {
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

export interface NotificationInput extends BaseHookInput {
  hook_event_name: "Notification";
  notification_type: "ToolPermission" | string;
  message?: string;
  details?: Record<string, unknown>;
}

export type GeminiHookInput =
  | SessionStartInput
  | SessionEndInput
  | BeforeAgentInput
  | AfterAgentInput
  | BeforeToolInput
  | AfterToolInput
  | NotificationInput
  | (BaseHookInput & Record<string, unknown>);

export interface GeminiHookOutput {
  decision?: "allow" | "deny" | "block";
  reason?: string;
  systemMessage?: string;
  suppressOutput?: boolean;
  continue?: boolean;
  stopReason?: string;
  hookSpecificOutput?: Record<string, unknown>;
}
