// Shared helpers for Herdr plugin commands (see herdr-plugin.toml).
//
// Herdr starts plugin commands with HERDR_PLUGIN_CONTEXT_JSON describing where
// they were invoked from. Its shape is `PluginInvocationContext` in
// `herdr api schema --json`; every field is optional and may be null.

/** Herdr's effective agent status for a pane. */
export type HerdrAgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

export interface HerdrPluginContext {
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

const STRING_FIELDS = [
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
  "link_handler_id",
] as const;

const AGENT_STATUSES: ReadonlySet<string> = new Set([
  "idle",
  "working",
  "blocked",
  "done",
  "unknown",
]);

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Parses HERDR_PLUGIN_CONTEXT_JSON. Returns null when the variable is missing,
 * is not valid JSON, or is not a JSON object. Fields with unexpected types are
 * treated as absent rather than failing the whole context.
 */
export function readPluginContext(
  env: NodeJS.ProcessEnv = process.env
): HerdrPluginContext | null {
  const raw = env.HERDR_PLUGIN_CONTEXT_JSON;
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  const context = {} as HerdrPluginContext;
  for (const field of STRING_FIELDS) {
    context[field] = stringOrNull(obj[field]);
  }
  const status = stringOrNull(obj.focused_pane_status);
  context.focused_pane_status =
    status && AGENT_STATUSES.has(status) ? (status as HerdrAgentStatus) : null;
  return context;
}

/** Command to run Herdr with (`HERDR_BIN_PATH`, set by Herdr). */
export function herdrBin(env: NodeJS.ProcessEnv = process.env): string {
  return env.HERDR_BIN_PATH || "herdr";
}
