import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { runDoctor } from "./doctor.js";
import { HerdrClient } from "../herdr/client.js";

let tmp: string;

function script(name: string, body: string): string {
  const file = path.join(tmp, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
  return file;
}

function runWithBinary(binPath: string, timeoutMs = 2000): string {
  const client = new HerdrClient({
    env: {
      HERDR_ENV: "1",
      HERDR_PANE_ID: "pane-test",
      HERDR_BIN_PATH: binPath,
    },
  });
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.join(" "));
  });
  runDoctor({ client, timeoutMs });
  return lines.join("\n");
}

beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "herdr-doctor-test-"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runDoctor", () => {
  it("reports success when the binary works", () => {
    const bin = script("ok", 'echo "herdr 1.2.3"');
    const out = runWithBinary(bin);

    expect(out).toContain("✅ herdr 1.2.3");
    expect(out).toContain("✅ Test report delivered successfully to Herdr!");
    expect(out).toContain("Doctor check completed.");
  });

  it("reports the spawn error when the binary does not exist", () => {
    const out = runWithBinary(path.join(tmp, "does-not-exist"));

    expect(out).toMatch(/❌ Failed to execute .*does-not-exist: .*ENOENT/);
    expect(out).toMatch(/⚠️ Test report failed: .*ENOENT/);
    expect(out).not.toContain("Cannot read properties of null");
    expect(out).not.toContain("✅");
  });

  it("reports a non-zero exit status and stderr instead of success", () => {
    const bin = script("fails", 'echo "socket unreachable" >&2; exit 3');
    const out = runWithBinary(bin);

    expect(out).toContain("❌ Failed to execute");
    expect(out).toContain("exited with code 3: socket unreachable");
    expect(out).toContain("⚠️ Test report failed: exited with code 3: socket unreachable");
    expect(out).not.toContain("✅");
  });

  it("reports a binary killed by a signal", () => {
    const bin = script("killed", "kill -TERM $$");
    const out = runWithBinary(bin);

    expect(out).toContain("killed by signal SIGTERM");
    expect(out).not.toContain("✅");
  });

  it("times out instead of hanging on an unresponsive binary", () => {
    const bin = script("hangs", "exec sleep 30");
    const started = Date.now();
    const out = runWithBinary(bin, 200);

    expect(Date.now() - started).toBeLessThan(5000);
    expect(out).toContain("timed out after 200ms");
    expect(out).not.toContain("✅");
  });
});
