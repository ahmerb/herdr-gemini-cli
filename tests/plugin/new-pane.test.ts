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

// Runs plugin/new-pane.sh against a stub `herdr` (via HERDR_BIN_PATH) and stub
// `gemini`, with a PATH containing only the system tools the script needs.

const ROOT = join(__dirname, "..", "..");
const SYSTEM_TOOLS = ["sed", "head", "dirname", "tr"];

const SPLIT_JSON = (paneId: string, cwd = "/work/a, b {c}") =>
  JSON.stringify({
    id: "cli:pane:split",
    result: {
      pane: { agent_status: "unknown", cwd, focused: true, pane_id: paneId, tab_id: "w1:t1" },
      type: "pane_info",
    },
  });

let dir: string;
let SYSTEM_PATH: string;
let stubBin: string;
let callLog: string;
let pathsFile: string;
let herdr: string;

function stub(name: string, body: string, where = stubBin): string {
  const file = join(where, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
  return file;
}

/** Stub herdr: logs argv; `pane split` prints splitOutput, `pane run` exits runStatus. */
function stubHerdr(splitOutput: string, { splitStatus = 0, runStatus = 0 } = {}) {
  const herdrDir = join(dir, "herdr-bin");
  mkdirSync(herdrDir, { recursive: true });
  writeFileSync(join(dir, "split.json"), splitOutput);
  herdr = stub(
    "herdr",
    `echo "herdr $*" >> "$CALL_LOG"
case "$1 $2" in
  "pane split") /bin/cat "${join(dir, "split.json")}"; exit ${splitStatus} ;;
  "pane run") exit ${runStatus} ;;
esac
exit 0`,
    herdrDir
  );
}

function run(env: Record<string, string> = {}, path = `${stubBin}:${SYSTEM_PATH}`) {
  return spawnSync("/bin/sh", [join(ROOT, "plugin", "new-pane.sh")], {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: path,
      HGC_PATHS_FILE: pathsFile,
      CALL_LOG: callLog,
      HERDR_ENV: "1",
      HERDR_BIN_PATH: herdr,
      ...env,
    },
  });
}

const calls = () => (existsSync(callLog) ? readFileSync(callLog, "utf8").trim().split("\n") : []);

const context = (fields: Record<string, unknown>) => JSON.stringify(fields);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hgc-new-pane-"));
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
  stubHerdr(SPLIT_JSON("w1:p7"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("plugin/new-pane.sh", () => {
  it("splits the focused pane to the right, focused, and runs gemini in the new pane", () => {
    stub("gemini", "exit 0");

    const res = run({
      HERDR_PANE_ID: "w1:p1",
      HERDR_PLUGIN_CONTEXT_JSON: context({
        focused_pane_id: "w1:p3",
        focused_pane_cwd: "/work/a, b {c}",
        workspace_label: '"focused_pane_id":"w9:p9"',
      }),
    });

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toEqual([
      "herdr pane split w1:p3 --direction right --focus",
      "herdr pane run w1:p7 gemini",
    ]);
    expect(res.stdout).toContain("started gemini in pane w1:p7");
  });

  it("parses pretty-printed JSON", () => {
    stub("gemini", "exit 0");
    stubHerdr(JSON.stringify(JSON.parse(SPLIT_JSON("w2:pA")), null, 2));

    const res = run({
      HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ focused_pane_id: "w2:p1" }, null, 2),
    });

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toEqual([
      "herdr pane split w2:p1 --direction right --focus",
      "herdr pane run w2:pA gemini",
    ]);
  });

  it("falls back to HERDR_PANE_ID, then to --current", () => {
    stub("gemini", "exit 0");

    expect(run({ HERDR_PANE_ID: "w1:p2", HERDR_PLUGIN_CONTEXT_JSON: "{}" }).status).toBe(0);
    expect(run().status).toBe(0);

    expect(calls().filter((c) => c.includes("split"))).toEqual([
      "herdr pane split w1:p2 --direction right --focus",
      "herdr pane split --current --direction right --focus",
    ]);
  });

  it("finds gemini via the recorded install-time path when Herdr's PATH lacks it", () => {
    const elsewhere = join(dir, "npm-global");
    mkdirSync(elsewhere);
    const gemini = stub("gemini", "exit 0", elsewhere);
    writeFileSync(pathsFile, `GEMINI_BIN=${gemini}\n`);

    const res = run({ HERDR_PANE_ID: "w1:p1" });

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toContain("herdr pane run w1:p7 gemini");
  });

  it("notifies and creates no pane when gemini is missing", () => {
    writeFileSync(pathsFile, "GEMINI_BIN=/nonexistent/gemini\n");

    const res = run({ HERDR_PANE_ID: "w1:p1" });

    expect(res.status).toBe(127);
    expect(res.stderr).toContain("gemini not found");
    expect(calls()).toEqual([
      "herdr notification show herdr-gemini-cli: gemini not found --body " +
        "Install Gemini CLI, then run: herdr plugin update herdr-gemini-cli",
    ]);
  });

  it("notifies when the split fails", () => {
    stub("gemini", "exit 0");
    stubHerdr("", { splitStatus: 1 });

    const res = run({ HERDR_PANE_ID: "w1:p1" });

    expect(res.status).toBe(1);
    expect(calls()[1]).toMatch(/^herdr notification show herdr-gemini-cli: could not split pane/);
    expect(calls().some((c) => c.includes("pane run"))).toBe(false);
  });

  it("notifies when the split output has no pane id", () => {
    stub("gemini", "exit 0");
    stubHerdr('{"id":"cli:pane:split","result":{}}');

    const res = run({ HERDR_PANE_ID: "w1:p1" });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("no pane id");
    expect(calls().some((c) => c.includes("pane run"))).toBe(false);
  });

  it("closes the new pane if gemini can't be started in it", () => {
    stub("gemini", "exit 0");
    stubHerdr(SPLIT_JSON("w1:p7"), { runStatus: 1 });

    const res = run({ HERDR_PANE_ID: "w1:p1" });

    expect(res.status).toBe(1);
    expect(calls().slice(1, 3)).toEqual(["herdr pane run w1:p7 gemini", "herdr pane close w1:p7"]);
    expect(calls()[3]).toMatch(/^herdr notification show herdr-gemini-cli: could not start gemini/);
  });
});
