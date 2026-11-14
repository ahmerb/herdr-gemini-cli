import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { HerdrClient } from "../herdr/client.js";
import type { ReportAgentOptions } from "../types/herdr.js";
import {
  clearBlocked,
  lookupSessionIdWithHerdr,
  parseAgentSessionId,
  type ClearBlockedDeps,
} from "./clear-blocked.js";

const HERDR_ENV = { HERDR_ENV: "1", HERDR_BIN_PATH: "/opt/herdr/bin/herdr" };

function contextEnv(context: unknown): NodeJS.ProcessEnv {
  return { ...HERDR_ENV, HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify(context) };
}

const BLOCKED_GEMINI = {
  focused_pane_id: "w3:p2",
  focused_pane_agent: "gemini-cli",
  focused_pane_status: "blocked",
  invocation_source: "cli",
};

/** Runs clearBlocked with a real HerdrClient whose herdr calls are recorded. */
async function run(env: NodeJS.ProcessEnv, overrides: Partial<ClearBlockedDeps> = {}) {
  const reports: string[][] = [];
  const clients: string[] = [];
  const lookups: string[] = [];
  const logs: string[] = [];
  const result = await clearBlocked({
    env,
    log: (m) => logs.push(m),
    lookupSessionId: async (paneId) => {
      lookups.push(paneId);
      return "sess-123";
    },
    createClient: (paneId, clientEnv) => {
      clients.push(paneId);
      const real = new HerdrClient({ paneId, env: clientEnv });
      return {
        isHerdrActive: () => real.isHerdrActive(),
        reportAgent: async (options: ReportAgentOptions) => {
          reports.push(real.buildReportArgs({ ...options, seq: 1_700_000_000_000_000 }));
          return true;
        },
      };
    },
    ...overrides,
  });
  return { result, reports, clients, lookups, logs };
}

describe("clearBlocked", () => {
  it("reports a blocked Gemini pane idle with the same source, agent and session", async () => {
    const { result, reports, logs } = await run(contextEnv(BLOCKED_GEMINI));

    expect(result).toBe("cleared");
    expect(reports).toEqual([
      [
        "pane",
        "report-agent",
        "w3:p2",
        "--source",
        "gemini-cli",
        "--agent",
        "gemini-cli",
        "--state",
        "idle",
        "--seq",
        "1700000000000000",
        "--agent-session-id",
        "sess-123",
      ],
    ]);
    expect(logs.join("\n")).toContain("w3:p2 reported idle");
  });

  it("targets the focused pane, not HERDR_PANE_ID", async () => {
    const env = { ...contextEnv(BLOCKED_GEMINI), HERDR_PANE_ID: "w1:p1" };
    const { reports, lookups } = await run(env);
    expect(lookups).toEqual(["w3:p2"]);
    expect(reports[0][2]).toBe("w3:p2");
  });

  it("omits the session id when Herdr holds none, and never sends a resume command", async () => {
    const { result, reports } = await run(contextEnv(BLOCKED_GEMINI), {
      lookupSessionId: async () => null,
    });
    expect(result).toBe("cleared");
    expect(reports[0]).not.toContain("--agent-session-id");
    expect(reports[0]).not.toContain("--");
    expect(reports[0].slice(-4)).toEqual(["--state", "idle", "--seq", "1700000000000000"]);
  });

  it("uses a microsecond seq by default", async () => {
    const real = new HerdrClient({ paneId: "w3:p2", env: HERDR_ENV });
    const args = real.buildReportArgs({ state: "idle" });
    const seq = Number(args[args.indexOf("--seq") + 1]);
    expect(seq).toBeGreaterThan(Date.now() * 1000 - 10_000_000);
  });

  it("leaves a non-Gemini pane alone", async () => {
    const { result, reports, clients, logs } = await run(
      contextEnv({ ...BLOCKED_GEMINI, focused_pane_agent: "claude" })
    );
    expect(result).toBe("not-gemini");
    expect(reports).toEqual([]);
    expect(clients).toEqual([]);
    expect(logs[0]).toContain("not a Gemini pane (agent: claude)");
  });

  it("leaves a pane with no agent alone", async () => {
    const { result, reports } = await run(
      contextEnv({ focused_pane_id: "w3:p2", focused_pane_status: "unknown" })
    );
    expect(result).toBe("not-gemini");
    expect(reports).toEqual([]);
  });

  it.each(["idle", "working", "done", "unknown", "bogus", null])(
    "leaves a Gemini pane with status %s alone",
    async (status) => {
      const { result, reports, lookups, logs } = await run(
        contextEnv({ ...BLOCKED_GEMINI, focused_pane_status: status })
      );
      expect(result).toBe("not-blocked");
      expect(reports).toEqual([]);
      expect(lookups).toEqual([]);
      expect(logs[0]).toContain("is not blocked");
    }
  );

  it("handles a missing or invalid context", async () => {
    for (const raw of [undefined, "", "{not json", "[]", "null"]) {
      const env: NodeJS.ProcessEnv = { ...HERDR_ENV };
      if (raw !== undefined) env.HERDR_PLUGIN_CONTEXT_JSON = raw;
      const { result, reports, logs } = await run(env);
      expect(result, String(raw)).toBe("no-context");
      expect(reports).toEqual([]);
      expect(logs[0]).toContain("no valid HERDR_PLUGIN_CONTEXT_JSON");
    }
  });

  it("handles a context without a focused pane", async () => {
    const { result, reports } = await run(
      contextEnv({ focused_pane_agent: "gemini-cli", focused_pane_status: "blocked" })
    );
    expect(result).toBe("no-pane");
    expect(reports).toEqual([]);
  });

  it("does nothing outside Herdr", async () => {
    const env = { HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify(BLOCKED_GEMINI) };
    const { result, reports, lookups } = await run(env);
    expect(result).toBe("not-herdr");
    expect(reports).toEqual([]);
    expect(lookups).toEqual([]);
  });

  it("logs a failed report", async () => {
    const { result, logs } = await run(contextEnv(BLOCKED_GEMINI), {
      createClient: () => ({ isHerdrActive: () => true, reportAgent: async () => false }),
    });
    expect(result).toBe("report-failed");
    expect(logs[0]).toContain("failed to report pane w3:p2 idle");
  });
});

// Shape of `herdr agent get <pane>` on herdr 0.9.5.
function agentGet(agentSession: unknown): string {
  return JSON.stringify({
    id: "cli:agent:get",
    result: {
      agent: { agent: "gemini-cli", agent_status: "blocked", pane_id: "w3:p2", agent_session: agentSession },
      type: "agent_info",
    },
  });
}

describe("parseAgentSessionId", () => {
  it("returns the Gemini session id", () => {
    expect(
      parseAgentSessionId(
        agentGet({ agent: "gemini-cli", kind: "id", source: "gemini-cli", value: "abc-123" })
      )
    ).toBe("abc-123");
  });

  it("returns null for other agents, missing sessions and bad output", () => {
    expect(
      parseAgentSessionId(agentGet({ agent: "claude", kind: "id", source: "herdr:claude", value: "x" }))
    ).toBeNull();
    expect(parseAgentSessionId(agentGet({ agent: "gemini-cli", kind: "path", value: "/x" }))).toBeNull();
    expect(parseAgentSessionId(agentGet({ agent: "gemini-cli", kind: "id", value: "" }))).toBeNull();
    expect(parseAgentSessionId(agentGet(null))).toBeNull();
    expect(parseAgentSessionId(agentGet(undefined))).toBeNull();
    expect(parseAgentSessionId("not json")).toBeNull();
    expect(parseAgentSessionId("null")).toBeNull();
  });
});

describe("lookupSessionIdWithHerdr", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function stubHerdr(body: string): string {
    dir = mkdtempSync(join(tmpdir(), "hgc-clear-blocked-"));
    const bin = join(dir, "herdr");
    writeFileSync(bin, `#!/bin/sh\n${body}\n`);
    chmodSync(bin, 0o755);
    return bin;
  }

  it("runs `herdr agent get <pane>` and parses the session id", async () => {
    const output = agentGet({ agent: "gemini-cli", kind: "id", source: "gemini-cli", value: "s-9" });
    const bin = stubHerdr(
      `[ "$1 $2 $3" = "agent get w3:p2" ] || exit 3\ncat <<'EOF'\n${output}\nEOF`
    );
    await expect(lookupSessionIdWithHerdr("w3:p2", { HERDR_BIN_PATH: bin })).resolves.toBe("s-9");
  });

  it("returns null when herdr fails or is missing", async () => {
    const bin = stubHerdr("exit 1");
    await expect(lookupSessionIdWithHerdr("w3:p2", { HERDR_BIN_PATH: bin })).resolves.toBeNull();
    await expect(
      lookupSessionIdWithHerdr("w3:p2", { HERDR_BIN_PATH: "/nonexistent/herdr" })
    ).resolves.toBeNull();
  });
});
