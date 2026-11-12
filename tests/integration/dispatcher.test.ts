import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import * as path from "path";

const dispatcherScript = path.resolve(__dirname, "../../dist/hooks/dispatcher.js");

describe("dispatcher CLI integration", () => {
  it("outputs empty JSON on empty stdin and exits 0", () => {
    const res = spawnSync("node", [dispatcherScript], {
      input: "",
      encoding: "utf8",
    });

    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout.trim())).toEqual({});
  });

  it("outputs empty JSON on malformed stdin and exits 0", () => {
    const res = spawnSync("node", [dispatcherScript], {
      input: "not-json-content",
      encoding: "utf8",
    });

    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout.trim())).toEqual({});
  });

  it("processes valid hook input and exits 0", () => {
    const payload = JSON.stringify({
      session_id: "test-123",
      transcript_path: "/tmp/t.json",
      cwd: "/tmp",
      hook_event_name: "BeforeAgent",
      timestamp: "2026-11-12T00:00:00Z",
      prompt: "test",
    });

    const res = spawnSync("node", [dispatcherScript], {
      input: payload,
      encoding: "utf8",
      env: {
        ...process.env,
        HERDR_ENV: "0", // dormant mode test
      },
    });

    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout.trim())).toEqual({});
  });
});
