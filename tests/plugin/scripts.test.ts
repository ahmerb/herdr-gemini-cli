import { spawnSync } from "child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Runs the plugin's shell scripts against stub `gemini` / `node` binaries.

const ROOT = join(__dirname, "..", "..");
// External tools the scripts use. They get a PATH containing only these, so a
// real node/gemini/herdr on the machine (e.g. /usr/bin/node on CI) can't leak in.
const SYSTEM_TOOLS = ["sed", "head", "dirname"];

let dir: string;
let SYSTEM_PATH: string;
let stubBin: string;
let callLog: string;
let pathsFile: string;

function stub(name: string, body: string): string {
  const file = join(stubBin, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
  return file;
}

function run(script: string, args: string[] = [], path?: string) {
  path ??= `${stubBin}:${SYSTEM_PATH}`;
  return spawnSync("/bin/sh", [join(ROOT, "plugin", script), ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { PATH: path, HGC_PATHS_FILE: pathsFile, CALL_LOG: callLog },
  });
}

const calls = () => (existsSync(callLog) ? readFileSync(callLog, "utf8").trim().split("\n") : []);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hgc-scripts-"));
  stubBin = join(dir, "bin");
  mkdirSync(stubBin);
  SYSTEM_PATH = join(dir, "sys");
  mkdirSync(SYSTEM_PATH);
  for (const tool of SYSTEM_TOOLS) {
    const found = spawnSync("/bin/sh", ["-c", `command -v ${tool}`], { encoding: "utf8" });
    symlinkSync(found.stdout.trim(), join(SYSTEM_PATH, tool));
  }
  callLog = join(dir, "calls.log");
  pathsFile = join(dir, "paths");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("plugin/install-extension.sh", () => {
  it("uninstalls any existing copy, then installs non-interactively", () => {
    const gemini = stub("gemini", 'echo "gemini $*" >> "$CALL_LOG"');
    const node = stub("node", "true");

    const res = run("install-extension.sh");

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toEqual([
      "gemini extensions uninstall herdr-gemini-cli",
      "gemini extensions install . --consent --skip-settings",
    ]);
    expect(readFileSync(pathsFile, "utf8")).toBe(`GEMINI_BIN=${gemini}\nNODE_BIN=${node}\n`);
    expect(res.stdout).toContain("Gemini CLI extension installed");
  });

  it("still installs when uninstall fails because nothing is installed", () => {
    stub(
      "gemini",
      'echo "gemini $*" >> "$CALL_LOG"; [ "$2" = uninstall ] && { echo "Extension not found." >&2; exit 1; }; exit 0'
    );
    stub("node", "true");

    const res = run("install-extension.sh");

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toHaveLength(2);
  });

  it("fails with a clear message when gemini is missing", () => {
    stub("node", "true");

    const res = run("install-extension.sh");

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Gemini CLI ('gemini') not found");
    expect(existsSync(pathsFile)).toBe(false);
  });

  it("fails with a clear message when node is missing", () => {
    stub("gemini", 'echo "gemini $*" >> "$CALL_LOG"');

    const res = run("install-extension.sh");

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Node.js ('node') not found");
    expect(calls()).toEqual([]);
  });

  it("fails the build when gemini extensions install fails", () => {
    stub("gemini", '[ "$2" = install ] && exit 3; exit 0');
    stub("node", "true");

    const res = run("install-extension.sh");

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("'gemini extensions install' failed");
  });
});

describe("plugin/node.sh", () => {
  it("runs node from the recorded path even when it is not on PATH", () => {
    const node = stub("node", 'echo "node $*"');
    writeFileSync(pathsFile, `NODE_BIN=${node}\n`);

    const res = run("node.sh", ["dist/plugin/commands/x.js", "arg"], SYSTEM_PATH);

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout.trim()).toBe("node dist/plugin/commands/x.js arg");
  });

  it("puts the recorded gemini directory on PATH for child processes", () => {
    const gemini = stub("gemini", "true");
    const node = stub("node", 'command -v gemini');
    writeFileSync(pathsFile, `GEMINI_BIN=${gemini}\nNODE_BIN=${node}\n`);

    const res = run("node.sh", [], SYSTEM_PATH);

    expect(res.stdout.trim()).toBe(gemini);
  });

  it("ignores recorded paths that no longer exist and falls back to PATH", () => {
    stub("node", 'echo "path node"');
    writeFileSync(pathsFile, "NODE_BIN=/nonexistent/node\n");

    const res = run("node.sh");

    expect(res.stdout.trim()).toBe("path node");
  });

  it("exits 127 with a message when node cannot be found", () => {
    const res = run("node.sh", [], SYSTEM_PATH);

    expect(res.status).toBe(127);
    expect(res.stderr).toContain("node not found");
  });
});
