import { describe, expect, it, vi } from "vitest";
import { handleHook } from "./handler.js";
import { HerdrClient } from "../herdr/client.js";
import {
  AfterAgentInput,
  BeforeAgentInput,
  BeforeToolInput,
  NotificationInput,
  SessionEndInput,
  SessionStartInput,
} from "../types/gemini.js";

describe("handleHook", () => {
  it("does nothing and returns empty object when outside Herdr", async () => {
    const client = new HerdrClient({ env: {} });
    const reportSpy = vi.spyOn(client, "reportAgent");
    const releaseSpy = vi.spyOn(client, "releaseAgent");

    const input: BeforeAgentInput = {
      session_id: "s-123",
      transcript_path: "/tmp/transcript.json",
      cwd: "/home/user/project",
      hook_event_name: "BeforeAgent",
      timestamp: "2026-11-12T00:00:00Z",
      prompt: "Hello",
    };

    const output = await handleHook(input, client);
    expect(output).toEqual({});
    expect(reportSpy).not.toHaveBeenCalled();
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it("handles SessionStart by reporting idle state, session ID, and resume command", async () => {
    const client = new HerdrClient({
      env: {
        HERDR_ENV: "1",
        HERDR_PANE_ID: "pane-1",
        HERDR_BIN_PATH: "/bin/herdr",
      },
    });

    const reportSpy = vi.spyOn(client, "reportAgent").mockResolvedValue(true);

    const input: SessionStartInput = {
      session_id: "test-session-uuid",
      transcript_path: "/tmp/transcript.json",
      cwd: "/home/user/project",
      hook_event_name: "SessionStart",
      timestamp: "2026-11-12T00:00:00Z",
      source: "startup",
    };

    const output = await handleHook(input, client);
    expect(output).toEqual({});
    expect(reportSpy).toHaveBeenCalledTimes(1);
    expect(reportSpy).toHaveBeenCalledWith({
      state: "idle",
      sessionId: "test-session-uuid",
      resumeArgv: ["gemini", "--resume", "test-session-uuid"],
    });
  });

  it("handles BeforeAgent by reporting working state", async () => {
    const client = new HerdrClient({
      env: {
        HERDR_ENV: "1",
        HERDR_PANE_ID: "pane-1",
        HERDR_BIN_PATH: "/bin/herdr",
      },
    });

    const reportSpy = vi.spyOn(client, "reportAgent").mockResolvedValue(true);

    const input: BeforeAgentInput = {
      session_id: "test-session-uuid",
      transcript_path: "/tmp/transcript.json",
      cwd: "/home/user/project",
      hook_event_name: "BeforeAgent",
      timestamp: "2026-11-12T00:00:00Z",
      prompt: "Write code",
    };

    const output = await handleHook(input, client);
    expect(output).toEqual({});
    expect(reportSpy).toHaveBeenCalledTimes(1);
    expect(reportSpy).toHaveBeenCalledWith({
      state: "working",
      sessionId: "test-session-uuid",
    });
  });

  it("handles Notification with ToolPermission by reporting blocked state and message", async () => {
    const client = new HerdrClient({
      env: {
        HERDR_ENV: "1",
        HERDR_PANE_ID: "pane-1",
        HERDR_BIN_PATH: "/bin/herdr",
      },
    });

    const reportSpy = vi.spyOn(client, "reportAgent").mockResolvedValue(true);

    const input: NotificationInput = {
      session_id: "test-session-uuid",
      transcript_path: "/tmp/transcript.json",
      cwd: "/home/user/project",
      hook_event_name: "Notification",
      timestamp: "2026-11-12T00:00:00Z",
      notification_type: "ToolPermission",
      details: {
        tool_name: "run_shell_command",
      },
      message: "Allow run_shell_command rm -rf /tmp/foo?",
    };

    const output = await handleHook(input, client);
    expect(output).toEqual({});
    expect(reportSpy).toHaveBeenCalledTimes(1);
    expect(reportSpy).toHaveBeenCalledWith({
      state: "blocked",
      message: "Allow run_shell_command rm -rf /tmp/foo?",
      sessionId: "test-session-uuid",
    });
  });

  it("ignores non-ToolPermission Notification events", async () => {
    const client = new HerdrClient({
      env: {
        HERDR_ENV: "1",
        HERDR_PANE_ID: "pane-1",
        HERDR_BIN_PATH: "/bin/herdr",
      },
    });

    const reportSpy = vi.spyOn(client, "reportAgent").mockResolvedValue(true);

    const input: NotificationInput = {
      session_id: "test-session-uuid",
      transcript_path: "/tmp/transcript.json",
      cwd: "/home/user/project",
      hook_event_name: "Notification",
      timestamp: "2026-11-12T00:00:00Z",
      notification_type: "GeneralAlert",
    };

    const output = await handleHook(input, client);
    expect(output).toEqual({});
    expect(reportSpy).not.toHaveBeenCalled();
  });

  it("handles BeforeTool by reporting working state when action resumes", async () => {
    const client = new HerdrClient({
      env: {
        HERDR_ENV: "1",
        HERDR_PANE_ID: "pane-1",
        HERDR_BIN_PATH: "/bin/herdr",
      },
    });

    const reportSpy = vi.spyOn(client, "reportAgent").mockResolvedValue(true);

    const input: BeforeToolInput = {
      session_id: "test-session-uuid",
      transcript_path: "/tmp/transcript.json",
      cwd: "/home/user/project",
      hook_event_name: "BeforeTool",
      timestamp: "2026-11-12T00:00:00Z",
      tool_name: "read_file",
    };

    const output = await handleHook(input, client);
    expect(output).toEqual({});
    expect(reportSpy).toHaveBeenCalledWith({
      state: "working",
      sessionId: "test-session-uuid",
    });
  });

  it("handles AfterAgent by reporting idle state", async () => {
    const client = new HerdrClient({
      env: {
        HERDR_ENV: "1",
        HERDR_PANE_ID: "pane-1",
        HERDR_BIN_PATH: "/bin/herdr",
      },
    });

    const reportSpy = vi.spyOn(client, "reportAgent").mockResolvedValue(true);

    const input: AfterAgentInput = {
      session_id: "test-session-uuid",
      transcript_path: "/tmp/transcript.json",
      cwd: "/home/user/project",
      hook_event_name: "AfterAgent",
      timestamp: "2026-11-12T00:00:00Z",
      prompt: "Hello",
      prompt_response: "Hi there!",
    };

    const output = await handleHook(input, client);
    expect(output).toEqual({});
    expect(reportSpy).toHaveBeenCalledWith({
      state: "idle",
      sessionId: "test-session-uuid",
    });
  });

  it("handles SessionEnd by releasing the agent", async () => {
    const client = new HerdrClient({
      env: {
        HERDR_ENV: "1",
        HERDR_PANE_ID: "pane-1",
        HERDR_BIN_PATH: "/bin/herdr",
      },
    });

    const releaseSpy = vi.spyOn(client, "releaseAgent").mockResolvedValue(true);

    const input: SessionEndInput = {
      session_id: "test-session-uuid",
      transcript_path: "/tmp/transcript.json",
      cwd: "/home/user/project",
      hook_event_name: "SessionEnd",
      timestamp: "2026-11-12T00:00:00Z",
      reason: "exit",
    };

    const output = await handleHook(input, client);
    expect(output).toEqual({});
    expect(releaseSpy).toHaveBeenCalledTimes(1);
  });
});
