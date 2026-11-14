// "Gemini: clear blocked state" plugin action (herdr-gemini-cli.clear-blocked).
//
// Gemini CLI fires no hook when a tool permission prompt is denied or
// cancelled, so the pane stays `blocked` until the next prompt. This action
// reports the focused pane `idle` again.
//
// Herdr (0.9.5) only lets this override the hooks' state when the report uses
// the same source and agent (`gemini-cli`) and a higher `--seq` than the hooks'
// last report; reports without a seq, or with a seconds-based one, are silently
// ignored. HerdrClient's microsecond seq satisfies that. The report never
// releases the pane or changes source/agent, so Herdr keeps the pane's stored
// session and resume command (`gemini --resume <id>`). Like the hooks' own
// AfterAgent report, it passes the pane's current session id along and leaves
// the resume command untouched.

import { execFile } from "child_process";
import { HerdrClient } from "../herdr/client.js";
import { herdrBin, readPluginContext } from "./context.js";

export const GEMINI_AGENT = "gemini-cli";

export type ClearBlockedResult =
  | "cleared"
  | "no-context"
  | "no-pane"
  | "not-gemini"
  | "not-blocked"
  | "not-herdr"
  | "report-failed";

/** The part of HerdrClient this action uses. */
export type ReportingClient = Pick<HerdrClient, "isHerdrActive" | "reportAgent">;

export interface ClearBlockedDeps {
  env?: NodeJS.ProcessEnv;
  /** Builds the client that reports on `paneId`. */
  createClient?: (paneId: string, env: NodeJS.ProcessEnv) => ReportingClient;
  /** Returns the Gemini session id Herdr holds for `paneId`, or null. */
  lookupSessionId?: (paneId: string, env: NodeJS.ProcessEnv) => Promise<string | null>;
  /** Where progress goes; stdout ends up in `herdr plugin log list`. */
  log?: (message: string) => void;
}

const PREFIX = "herdr-gemini-cli clear-blocked:";

/**
 * Extracts the Gemini session id from `herdr agent get <pane>` JSON output.
 * Returns null unless the pane's session belongs to the gemini-cli agent.
 */
export function parseAgentSessionId(stdout: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const session = (parsed as { result?: { agent?: { agent_session?: unknown } } } | null)
    ?.result?.agent?.agent_session as
    | { agent?: unknown; kind?: unknown; value?: unknown }
    | null
    | undefined;
  if (
    !session ||
    session.agent !== GEMINI_AGENT ||
    session.kind !== "id" ||
    typeof session.value !== "string" ||
    session.value.length === 0
  ) {
    return null;
  }
  return session.value;
}

/** Reads the pane's session id via `herdr agent get`. Never throws. */
export function lookupSessionIdWithHerdr(
  paneId: string,
  env: NodeJS.ProcessEnv
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(
        herdrBin(env),
        ["agent", "get", paneId],
        { env, timeout: 2000, encoding: "utf8" },
        (error, stdout) => resolve(error ? null : parseAgentSessionId(stdout))
      );
    } catch {
      resolve(null);
    }
  });
}

export async function clearBlocked(deps: ClearBlockedDeps = {}): Promise<ClearBlockedResult> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((message: string) => console.log(message));
  const createClient =
    deps.createClient ?? ((paneId, clientEnv) => new HerdrClient({ paneId, env: clientEnv }));
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
      `${PREFIX} pane ${paneId} is not a Gemini pane (agent: ${
        context.focused_pane_agent ?? "none"
      }); nothing to do.`
    );
    return "not-gemini";
  }

  if (context.focused_pane_status !== "blocked") {
    log(
      `${PREFIX} pane ${paneId} is not blocked (status: ${
        context.focused_pane_status ?? "unknown"
      }); nothing to do.`
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
    ...(sessionId ? { sessionId } : {}),
  });
  if (!reported) {
    log(`${PREFIX} failed to report pane ${paneId} idle.`);
    return "report-failed";
  }

  log(`${PREFIX} pane ${paneId} reported idle${sessionId ? ` (session ${sessionId})` : ""}.`);
  return "cleared";
}
