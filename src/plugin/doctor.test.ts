import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandResult } from "../cli/diagnostics.js";
import {
  FIX_REINSTALL_EXTENSION,
  parseAgentList,
  parseGeminiExtensions,
  reportStateFor,
  runPluginDoctor,
  waitForKeypress,
  type PluginDoctorOptions,
} from "./doctor.js";

const HERDR = "/opt/herdr/bin/herdr";
const SHA = "3be1207c05f419662b4932d67512e4bc87d1104d";

const EXTENSIONS_OUTPUT = `✓ some-other-ext (2.0.0)
 Source: https://github.com/example/other.git (Type: git)
 Ref: main

✓ herdr-gemini-cli (0.1.0)
 ID: 0123abcd
 Path: /Users/me/.gemini/extensions/herdr-gemini-cli
 Source: https://github.com/ahmerb/herdr-gemini-cli.git (Type: git)
 Ref: ${SHA}
 Enabled (User): true
`;

type Reply = Partial<CommandResult>;
const okReply = (stdout = ""): Reply => ({ status: 0, stdout });
const enoent = (cmd: string): Reply => {
  const error = Object.assign(new Error(`spawnSync ${cmd} ENOENT`), { code: "ENOENT" });
  return { status: null, error };
};

function agentList(agents: Array<Record<string, unknown>>): string {
  return JSON.stringify({ id: "cli:agent:list", result: { agents, type: "agent_list" } });
}

let root: string;
let calls: string[][];
let replies: Record<string, Reply>;

function context(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

async function doctor(overrides: PluginDoctorOptions & { context?: Record<string, unknown> } = {}) {
  const lines: string[] = [];
  const env: NodeJS.ProcessEnv = {
    HERDR_ENV: "1",
    HERDR_BIN_PATH: HERDR,
    HERDR_SOCKET_PATH: "/tmp/herdr.sock",
    ...(overrides.context ? { HERDR_PLUGIN_CONTEXT_JSON: context(overrides.context) } : {}),
    ...overrides.env,
  };
  let waited = false;
  const summary = await runPluginDoctor({
    rootDir: root,
    nodeExecPath: "/usr/local/bin/node",
    nodeVersion: "v22.1.0",
    run: (cmd, args) => {
      calls.push([cmd, ...args]);
      const key = [cmd, ...args].join(" ");
      const match = Object.keys(replies)
        .filter((k) => key.startsWith(k))
        .sort((a, b) => b.length - a.length)[0];
      const reply = match ? replies[match] : { status: 1, stderr: `no stub for ${key}` };
      return { status: null, signal: null, stdout: "", stderr: "", ...reply };
    },
    waitForKey: async () => {
      expect(lines.at(-1)).toBe("Press any key to close");
      waited = true;
    },
    ...overrides,
    env,
    out: (line) => lines.push(line),
  });
  return { summary, out: lines.join("\n"), waited };
}

const reportCalls = () => calls.filter((c) => c.includes("report-agent"));

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "hgc-plugin-doctor-"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "0.1.0" }));
  calls = [];
  replies = {
    [`${HERDR} --version`]: okReply("herdr 0.9.5\n"),
    [`${HERDR} agent list`]: okReply(agentList([])),
    [`${HERDR} pane report-agent`]: okReply(),
    "gemini --version": okReply("0.68.0\n"),
    "gemini extensions list": okReply(EXTENSIONS_OUTPUT),
  };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("runPluginDoctor", () => {
  it("passes every check and re-reports a gemini-cli pane's current state", async () => {
    replies[`${HERDR} agent list`] = okReply(
      agentList([
        { pane_id: "w1:p1", agent: "gemini-cli", agent_status: "blocked", cwd: "/src/app" },
        { pane_id: "w1:p2", agent: "claude", agent_status: "working" },
      ])
    );
    const { summary, out, waited } = await doctor({
      context: { focused_pane_id: "w1:p1", focused_pane_agent: "gemini-cli", focused_pane_status: "blocked" },
    });

    expect(summary).toEqual({ failures: 0, warnings: 0, reportSent: true });
    expect(waited).toBe(true);
    expect(out).toContain("✅ Herdr: herdr 0.9.5");
    expect(out).toContain("✅ Node.js: v22.1.0 (/usr/local/bin/node)");
    expect(out).toContain("✅ Herdr socket: reachable (/tmp/herdr.sock)");
    expect(out).toContain("✅ Gemini agents: 1 pane");
    expect(out).toContain("w1:p1  blocked  /src/app");
    expect(out).not.toContain("w1:p2");
    expect(out).toContain("✅ Test report: delivered to w1:p1 (state: blocked)");
    expect(out).toContain("✅ Gemini CLI: 0.68.0");
    expect(out).toContain(`✅ Gemini extension: herdr-gemini-cli 0.1.0, type: git, ref: ${SHA}`);
    expect(out).toContain("All checks passed.");
    expect(out).not.toContain("❌");

    const [report] = reportCalls();
    expect(report.slice(0, 10)).toEqual([
      HERDR, "pane", "report-agent", "w1:p1", "--source", "gemini-cli", "--agent", "gemini-cli", "--state", "blocked",
    ]);
    // Herdr ignores reports whose seq is not a microsecond timestamp.
    const seq = Number(report[report.indexOf("--seq") + 1]);
    expect(Math.abs(seq - Date.now() * 1000)).toBeLessThan(60_000_000);
  });

  it.each([
    ["done", "idle"],
    ["idle", "idle"],
    ["working", "working"],
  ])("reports %s as %s", async (status, state) => {
    replies[`${HERDR} agent list`] = okReply(
      agentList([{ pane_id: "w1:p1", agent: "gemini-cli", agent_status: status }])
    );
    await doctor({ context: { focused_pane_id: "w1:p1", focused_pane_agent: "gemini-cli", focused_pane_status: status } });
    expect(reportCalls()).toHaveLength(1);
    expect(reportCalls()[0]).toContain(state);
  });

  it("never reports to another agent's pane", async () => {
    replies[`${HERDR} agent list`] = okReply(
      agentList([{ pane_id: "w1:p2", agent: "claude", agent_status: "working" }])
    );
    const { summary, out } = await doctor({
      context: { focused_pane_id: "w1:p2", focused_pane_agent: "claude", focused_pane_status: "working" },
    });

    expect(reportCalls()).toEqual([]);
    expect(summary.reportSent).toBe(false);
    expect(out).toContain("➖ Test report: skipped (w1:p2 is not a gemini-cli agent pane; checked read-only)");
    expect(out).toContain("➖ Gemini agents: no panes are registered as gemini-cli agents");
  });

  it("never reports to a plain shell pane", async () => {
    await doctor({ context: { focused_pane_id: "w1:p3", focused_pane_status: "unknown" } });
    expect(reportCalls()).toEqual([]);
  });

  it("does not report when the pane is no longer a gemini-cli agent", async () => {
    replies[`${HERDR} agent list`] = okReply(
      agentList([{ pane_id: "w1:p1", agent: "claude", agent_status: "idle" }])
    );
    await doctor({ context: { focused_pane_id: "w1:p1", focused_pane_agent: "gemini-cli", focused_pane_status: "idle" } });
    expect(reportCalls()).toEqual([]);
  });

  it("does not report an unknown state", async () => {
    replies[`${HERDR} agent list`] = okReply(
      agentList([{ pane_id: "w1:p1", agent: "gemini-cli", agent_status: "unknown" }])
    );
    const { out } = await doctor({
      context: { focused_pane_id: "w1:p1", focused_pane_agent: "gemini-cli", focused_pane_status: "unknown" },
    });
    expect(reportCalls()).toEqual([]);
    expect(out).toContain("skipped (w1:p1 has no reportable state)");
  });

  it("skips the test report without a plugin context", async () => {
    const { out } = await doctor();
    expect(reportCalls()).toEqual([]);
    expect(out).toContain("➖ Test report: skipped (no focused pane)");
  });

  it("reports a failed test report", async () => {
    replies[`${HERDR} agent list`] = okReply(
      agentList([{ pane_id: "w1:p1", agent: "gemini-cli", agent_status: "idle" }])
    );
    replies[`${HERDR} pane report-agent`] = { status: 2, stderr: "pane not found" };
    const { summary, out } = await doctor({
      context: { focused_pane_id: "w1:p1", focused_pane_agent: "gemini-cli", focused_pane_status: "idle" },
    });
    expect(summary.failures).toBe(1);
    expect(out).toContain("❌ Test report: report-agent to w1:p1 failed: exited with code 2: pane not found");
  });

  it("fails the Herdr check when the binary can't run", async () => {
    replies[`${HERDR} --version`] = enoent(HERDR);
    const { summary, out } = await doctor();
    expect(summary.failures).toBe(1);
    expect(out).toMatch(/❌ Herdr: .* --version failed: .*ENOENT/);
    expect(out).toMatch(/Fix: check that Herdr is installed/);
  });

  it("fails the socket check, and skips the report, when Herdr is unreachable", async () => {
    replies[`${HERDR} agent list`] = { status: 1, stderr: "connection refused" };
    const { summary, out } = await doctor({
      context: { focused_pane_id: "w1:p1", focused_pane_agent: "gemini-cli", focused_pane_status: "idle" },
    });
    expect(summary.failures).toBe(1);
    expect(out).toContain("❌ Herdr socket:");
    expect(out).toContain("connection refused");
    expect(out).toContain("Fix: check that the Herdr server is running (socket: /tmp/herdr.sock)");
    expect(out).toContain("➖ Test report: skipped (Herdr socket unreachable)");
    expect(reportCalls()).toEqual([]);
  });

  it("fails the socket check on unexpected agent list output", async () => {
    replies[`${HERDR} agent list`] = okReply("not json");
    const { out } = await doctor();
    expect(out).toContain("❌ Herdr socket: unexpected");
  });

  it("warns about Node.js older than 20", async () => {
    const { summary, out } = await doctor({ nodeVersion: "v18.19.0" });
    expect(summary.warnings).toBe(1);
    expect(out).toContain("⚠️  Node.js: v18.19.0 at /usr/local/bin/node is older than 20");
    expect(out).toContain("Fix: install Node.js 20+, then run: herdr plugin update herdr-gemini-cli");
  });

  it("fails when gemini is not found, without listing extensions", async () => {
    replies["gemini --version"] = enoent("gemini");
    const { summary, out } = await doctor();
    expect(summary.failures).toBe(1);
    expect(out).toMatch(/❌ Gemini CLI: gemini --version failed: .*ENOENT/);
    expect(out).toContain("Fix: install Gemini CLI");
    expect(calls.some((c) => c.includes("extensions"))).toBe(false);
  });

  it("fails with the reinstall hint when the extension is not installed", async () => {
    replies["gemini extensions list"] = okReply("No extensions installed.\n");
    const { summary, out } = await doctor();
    expect(summary.failures).toBe(1);
    expect(out).toContain("❌ Gemini extension: herdr-gemini-cli is not installed");
    expect(out).toContain(`Fix: ${FIX_REINSTALL_EXTENSION}`);
  });

  it("flags an extension version that doesn't match the plugin", async () => {
    replies["gemini extensions list"] = okReply(EXTENSIONS_OUTPUT.replace("herdr-gemini-cli (0.1.0)", "herdr-gemini-cli (0.0.9)"));
    const { out } = await doctor();
    expect(out).toContain("❌ Gemini extension: herdr-gemini-cli 0.0.9 does not match plugin 0.1.0");
    expect(out).toContain(`Fix: ${FIX_REINSTALL_EXTENSION}`);
  });

  it("fails when gemini extensions list fails or times out", async () => {
    const error = Object.assign(new Error("spawnSync gemini ETIMEDOUT"), { code: "ETIMEDOUT" });
    replies["gemini extensions list"] = { status: null, error };
    const { out } = await doctor({ geminiTimeoutMs: 1234 });
    expect(out).toContain("❌ Gemini extension: gemini extensions list failed: timed out after 1234ms");
  });

  it("treats missing plugin/.paths as fine", async () => {
    const { summary, out } = await doctor();
    expect(summary.failures).toBe(0);
    expect(out).toMatch(/➖ Recorded paths: .*not found \(expected for a `herdr plugin link`ed checkout\)/);
  });

  it("checks the recorded paths", async () => {
    const node = path.join(root, "node");
    writeFileSync(node, "#!/bin/sh\n");
    chmodSync(node, 0o755);
    const gemini = path.join(root, "gone", "gemini");
    writeFileSync(path.join(root, "paths"), `GEMINI_BIN=${gemini}\nNODE_BIN=${node}\n`);

    const { summary, out } = await doctor({ env: { HGC_PATHS_FILE: "paths" } });
    expect(summary.failures).toBe(1);
    expect(out).toContain(`❌ Recorded GEMINI_BIN: ${gemini} is not executable`);
    expect(out).toContain(`✅ Recorded NODE_BIN: ${node}`);
  });

  it("survives a runner that throws", async () => {
    const { summary } = await doctor({
      run: () => {
        throw new Error("boom");
      },
    });
    expect(summary.failures).toBeGreaterThan(0);
  });
});

describe("parseGeminiExtensions", () => {
  it("parses name, version, source, type and ref", () => {
    const entries = parseGeminiExtensions(`\x1b[32m${EXTENSIONS_OUTPUT}\x1b[0m`);
    expect(entries.map((e) => e.name)).toEqual(["some-other-ext", "herdr-gemini-cli"]);
    expect(entries[1]).toMatchObject({
      marker: "✓",
      version: "0.1.0",
      source: "https://github.com/ahmerb/herdr-gemini-cli.git",
      type: "git",
      ref: SHA,
    });
    expect(entries[1].fields["Enabled (User)"]).toBe("true");
  });

  it("returns nothing when no extensions are installed", () => {
    expect(parseGeminiExtensions("No extensions installed.\n")).toEqual([]);
  });
});

describe("parseAgentList", () => {
  it("returns null for non-agent-list output", () => {
    expect(parseAgentList("nope")).toBeNull();
    expect(parseAgentList('{"result":{}}')).toBeNull();
  });
});

describe("reportStateFor", () => {
  it("maps Herdr statuses to reportable states", () => {
    expect(reportStateFor("done")).toBe("idle");
    expect(reportStateFor("blocked")).toBe("blocked");
    expect(reportStateFor("unknown")).toBeNull();
    expect(reportStateFor(null)).toBeNull();
  });
});

describe("waitForKeypress", () => {
  it("resolves immediately when stdin is not a TTY", async () => {
    await expect(waitForKeypress({ isTTY: false } as NodeJS.ReadStream)).resolves.toBeUndefined();
  });
});
