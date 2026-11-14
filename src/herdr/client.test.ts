import { describe, expect, it } from "vitest";
import { HerdrClient } from "./client.js";

describe("HerdrClient", () => {
  it("detects dormant state when HERDR_ENV is not set", () => {
    const client = new HerdrClient({ env: {} });
    expect(client.isHerdrActive()).toBe(false);
    expect(client.getEnvironment()).toEqual({
      isHerdr: false,
      paneId: null,
      binPath: null,
      socketPath: null,
    });
  });

  it("detects active state when Herdr env vars are present", () => {
    const client = new HerdrClient({
      env: {
        HERDR_ENV: "1",
        HERDR_PANE_ID: "pane-42",
        HERDR_BIN_PATH: "/usr/local/bin/herdr",
        HERDR_SOCKET_PATH: "/tmp/herdr.sock",
      },
    });

    expect(client.isHerdrActive()).toBe(true);
    expect(client.getEnvironment()).toEqual({
      isHerdr: true,
      paneId: "pane-42",
      binPath: "/usr/local/bin/herdr",
      socketPath: "/tmp/herdr.sock",
    });
  });

  it("reports on an explicit paneId instead of HERDR_PANE_ID", () => {
    const client = new HerdrClient({
      env: {
        HERDR_ENV: "1",
        HERDR_PANE_ID: "w1:p1",
        HERDR_BIN_PATH: "/usr/local/bin/herdr",
      },
      paneId: "w1:p7",
    });

    expect(client.getEnvironment().paneId).toBe("w1:p7");
    expect(client.buildReportArgs({ state: "idle", seq: 1 })[2]).toBe("w1:p7");
    expect(client.buildReleaseArgs({ seq: 2 })[2]).toBe("w1:p7");
  });

  it("is active with an explicit paneId even when HERDR_PANE_ID is unset", () => {
    // Herdr popups do not export HERDR_PANE_ID.
    const client = new HerdrClient({
      env: { HERDR_ENV: "1", HERDR_BIN_PATH: "/usr/local/bin/herdr" },
      paneId: "w2:p3",
    });

    expect(client.isHerdrActive()).toBe(true);
  });

  it("generates strictly increasing sequence numbers", () => {
    const client = new HerdrClient({ env: {} });
    const seq1 = client.nextSeq();
    const seq2 = client.nextSeq();
    const seq3 = client.nextSeq();

    expect(seq2).toBeGreaterThan(seq1);
    expect(seq3).toBeGreaterThan(seq2);
  });

  it("builds correct report-agent arguments for working state", () => {
    const client = new HerdrClient({
      env: {
        HERDR_ENV: "1",
        HERDR_PANE_ID: "pane-100",
        HERDR_BIN_PATH: "/bin/herdr",
      },
    });

    const args = client.buildReportArgs({
      state: "working",
      seq: 123456789,
    });

    expect(args).toEqual([
      "pane",
      "report-agent",
      "pane-100",
      "--source",
      "gemini-cli",
      "--agent",
      "gemini-cli",
      "--state",
      "working",
      "--seq",
      "123456789",
    ]);
  });

  it("builds correct report-agent arguments with session and resume command", () => {
    const client = new HerdrClient({
      env: {
        HERDR_ENV: "1",
        HERDR_PANE_ID: "pane-100",
        HERDR_BIN_PATH: "/bin/herdr",
      },
    });

    const resumeArgv = client.buildResumeCommand("session-abc-123");
    const args = client.buildReportArgs({
      state: "idle",
      sessionId: "session-abc-123",
      resumeArgv,
      seq: 999,
    });

    expect(args).toEqual([
      "pane",
      "report-agent",
      "pane-100",
      "--source",
      "gemini-cli",
      "--agent",
      "gemini-cli",
      "--state",
      "idle",
      "--seq",
      "999",
      "--agent-session-id",
      "session-abc-123",
      "--",
      "gemini",
      "--resume",
      "session-abc-123",
    ]);
  });

  it("falls back to a bare resume command for unsafe session IDs", () => {
    const client = new HerdrClient({ env: {} });

    expect(client.buildResumeCommand("")).toEqual(["gemini"]);
    expect(client.buildResumeCommand("   ")).toEqual(["gemini"]);
    expect(client.buildResumeCommand("abc'def")).toEqual(["gemini"]);
    expect(client.buildResumeCommand("abc\x00def")).toEqual(["gemini"]);
    expect(client.buildResumeCommand("abc\ndef")).toEqual(["gemini"]);
    expect(client.buildResumeCommand("abc\x1fdef")).toEqual(["gemini"]);
    expect(client.buildResumeCommand("abc\x7fdef")).toEqual(["gemini"]);
    expect(client.buildResumeCommand("  abc-123  ")).toEqual([
      "gemini",
      "--resume",
      "abc-123",
    ]);
  });

  it("builds correct report-agent arguments for blocked state with message", () => {
    const client = new HerdrClient({
      env: {
        HERDR_ENV: "1",
        HERDR_PANE_ID: "pane-100",
        HERDR_BIN_PATH: "/bin/herdr",
      },
    });

    const args = client.buildReportArgs({
      state: "blocked",
      message: "Waiting for approval to execute run_shell_command",
      seq: 1001,
    });

    expect(args).toEqual([
      "pane",
      "report-agent",
      "pane-100",
      "--source",
      "gemini-cli",
      "--agent",
      "gemini-cli",
      "--state",
      "blocked",
      "--seq",
      "1001",
      "--message",
      "Waiting for approval to execute run_shell_command",
    ]);
  });

  it("builds correct release-agent arguments", () => {
    const client = new HerdrClient({
      env: {
        HERDR_ENV: "1",
        HERDR_PANE_ID: "pane-100",
        HERDR_BIN_PATH: "/bin/herdr",
      },
    });

    const args = client.buildReleaseArgs({ seq: 2002 });
    expect(args).toEqual([
      "pane",
      "release-agent",
      "pane-100",
      "--source",
      "gemini-cli",
      "--agent",
      "gemini-cli",
      "--seq",
      "2002",
    ]);
  });

  it("handles dormant execution gracefully without error", async () => {
    const client = new HerdrClient({ env: {} });
    const reported = await client.reportAgent({ state: "idle" });
    const released = await client.releaseAgent();

    expect(reported).toBe(false);
    expect(released).toBe(false);
  });
});
