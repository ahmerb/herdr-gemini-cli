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
import { parse } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Runs the reinstall / remove extension action scripts against stub `gemini`,
// `node` and `herdr` binaries.

const ROOT = join(__dirname, "..", "..");
// External tools the scripts use. They get a PATH containing only these, so a
// real node/gemini/herdr on the machine can't leak in.
const SYSTEM_TOOLS = ["sh", "sed", "head", "dirname", "awk"];

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

function run(script: string, args: string[] = [], opts: { path?: string; env?: Record<string, string> } = {}) {
  const path = opts.path ?? `${stubBin}:${SYSTEM_PATH}`;
  return spawnSync("/bin/sh", [join(ROOT, "plugin", script), ...args], {
    cwd: dir,
    encoding: "utf8",
    // stdin is a pipe (not a TTY), so prompts and the "Press Enter" wait are skipped.
    env: { PATH: path, HGC_PATHS_FILE: pathsFile, CALL_LOG: callLog, ...opts.env },
  });
}

const calls = () => (existsSync(callLog) ? readFileSync(callLog, "utf8").trim().split("\n") : []);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hgc-ext-actions-"));
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

/** `gemini extensions list` output, in Gemini 0.68's text format. */
function listOutput(name: string, source: string, type: string) {
  return [
    `✓ ${name} (0.1.0)`,
    ` ID: abc123`,
    ` name: def456`,
    ` Path: /home/user/.gemini/extensions/${name}`,
    ` Source: ${source} (Type: ${type})`,
    ` Enabled (User): true`,
    ` Enabled (Workspace): true`,
    "",
  ].join("\n");
}

/** Stub gemini: logs argv, prints LIST for `extensions list`, succeeds otherwise. */
function stubGemini(list: string) {
  // printf is a shell builtin, so the stub needs no `cat` on PATH.
  const quoted = `'${list.replace(/'/g, `'\\''`)}'`;
  return stub(
    "gemini",
    `echo "gemini $*" >> "$CALL_LOG"
     [ "$2" = list ] && printf '%s' ${quoted}
     exit 0`
  );
}

describe("plugin/remove-extension.sh", () => {
  it("uninstalls the extension", () => {
    stub("gemini", 'echo "gemini $*" >> "$CALL_LOG"; echo "Extension \\"herdr-gemini-cli\\" successfully uninstalled."');

    const res = run("remove-extension.sh");

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toEqual(["gemini extensions uninstall herdr-gemini-cli"]);
    expect(res.stdout).toContain("successfully uninstalled");
    expect(res.stdout).toContain("Gemini CLI extension removed");
  });

  it("succeeds when the extension is not installed", () => {
    stub("gemini", 'echo "Extension not found." >&2; exit 1');

    const res = run("remove-extension.sh");

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("not installed; nothing to remove");
  });

  it("fails with the output when uninstall fails for another reason", () => {
    stub("gemini", 'echo "EACCES: permission denied" >&2; exit 1');

    const res = run("remove-extension.sh");

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("EACCES: permission denied");
    expect(res.stderr).toContain("'gemini extensions uninstall herdr-gemini-cli' failed");
  });

  it("uses the recorded gemini when it is not on PATH", () => {
    const gemini = stub("gemini", 'echo "gemini $*" >> "$CALL_LOG"');
    writeFileSync(pathsFile, `GEMINI_BIN=${gemini}\n`);

    const res = run("remove-extension.sh", [], { path: SYSTEM_PATH });

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toEqual(["gemini extensions uninstall herdr-gemini-cli"]);
  });

  it("fails with a clear message when gemini is missing", () => {
    const res = run("remove-extension.sh");

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Gemini CLI ('gemini') not found");
  });
});

describe("plugin/reinstall-extension.sh", () => {
  it("runs install-extension.sh when the extension is not installed", () => {
    stubGemini("No extensions installed.\n");
    stub("node", "true");

    const res = run("reinstall-extension.sh");

    expect(res.status, res.stderr).toBe(0);
    // No git stub, so install-extension.sh falls back to the local checkout.
    expect(calls()).toEqual([
      "gemini extensions list",
      "gemini extensions uninstall herdr-gemini-cli",
      "gemini extensions install . --consent --skip-settings",
    ]);
    expect(res.stdout).toContain("Gemini CLI extension installed from");
  });

  it("replaces a git or local install without asking", () => {
    stubGemini(listOutput("herdr-gemini-cli", "https://github.com/ahmerb/herdr-gemini-cli", "git"));
    stub("node", "true");

    const res = run("reinstall-extension.sh");

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toContain("gemini extensions install . --consent --skip-settings");
  });

  it("keeps a dev link when it cannot ask", () => {
    stubGemini(listOutput("herdr-gemini-cli", "/home/user/src/herdr-gemini-cli", "link"));
    stub("node", "true");

    const res = run("reinstall-extension.sh");

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toEqual(["gemini extensions list"]);
    expect(res.stdout).toContain("currently a dev link");
    expect(res.stdout).toContain("/home/user/src/herdr-gemini-cli");
    expect(res.stdout).toContain("kept the dev link");
  });

  it("replaces a dev link when HGC_REPLACE_LINK=1", () => {
    stubGemini(listOutput("herdr-gemini-cli", "/home/user/src/herdr-gemini-cli", "link"));
    stub("node", "true");

    const res = run("reinstall-extension.sh", [], { env: { HGC_REPLACE_LINK: "1" } });

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toContain("gemini extensions install . --consent --skip-settings");
  });

  it("ignores links belonging to other extensions", () => {
    stubGemini(
      listOutput("herdr-gemini-cli", "https://github.com/ahmerb/herdr-gemini-cli", "git") +
        listOutput("other-ext", "/home/user/src/other-ext", "link")
    );
    stub("node", "true");

    const res = run("reinstall-extension.sh");

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).not.toContain("dev link");
    expect(calls()).toContain("gemini extensions install . --consent --skip-settings");
  });

  it("fails with a clear message when gemini is missing", () => {
    stub("node", "true");

    const res = run("reinstall-extension.sh");

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Gemini CLI ('gemini') not found");
  });
});

describe("plugin/run-in-popup.sh", () => {
  it("runs the script, reports success and exits with its status", () => {
    writeFileSync(join(dir, "ok.sh"), 'echo "hello $1"\n');

    const res = run("run-in-popup.sh", [join(dir, "ok.sh"), "world"]);

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("hello world");
    expect(res.stdout).toContain("Done.");
    expect(res.stdout).not.toContain("Press Enter");
  });

  it("reports failure and passes the exit status through", () => {
    writeFileSync(join(dir, "bad.sh"), 'echo "boom" >&2; exit 3\n');

    const res = run("run-in-popup.sh", [join(dir, "bad.sh")]);

    expect(res.status).toBe(3);
    expect(res.stderr).toContain("boom");
    expect(res.stdout).toContain("Failed (exit status 3).");
  });
});

describe("plugin/open-popup.sh", () => {
  it("opens the plugin pane through HERDR_BIN_PATH", () => {
    const herdr = stub("my-herdr", 'echo "herdr $*" >> "$CALL_LOG"');

    const res = run("open-popup.sh", ["remove-extension"], { env: { HERDR_BIN_PATH: herdr } });

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toEqual([
      "herdr plugin pane open --plugin herdr-gemini-cli --entrypoint remove-extension",
    ]);
  });

  it("falls back to herdr on PATH and notifies when the popup cannot open", () => {
    stub("herdr", 'echo "herdr $*" >> "$CALL_LOG"; [ "$1" = plugin ] && exit 1; exit 0');

    const res = run("open-popup.sh", ["reinstall-extension"]);

    expect(res.status).toBe(1);
    expect(calls()[0]).toBe(
      "herdr plugin pane open --plugin herdr-gemini-cli --entrypoint reinstall-extension"
    );
    expect(calls()[1]).toContain("herdr notification show herdr-gemini-cli: could not open popup");
  });
});

describe("herdr-plugin.toml extension actions", () => {
  type Table = Record<string, unknown>;
  const manifest = parse(readFileSync(join(ROOT, "herdr-plugin.toml"), "utf8")) as Table;
  const byId = (name: string, id: string) =>
    ((manifest[name] as Table[] | undefined) ?? []).find((item) => item.id === id);

  for (const [id, script] of [
    ["reinstall-extension", "plugin/reinstall-extension.sh"],
    ["remove-extension", "plugin/remove-extension.sh"],
  ]) {
    it(`${id}: the action opens a popup that runs ${script}`, () => {
      expect(byId("actions", id)?.command).toEqual(["sh", "plugin/open-popup.sh", id]);
      const pane = byId("panes", id);
      expect(pane?.placement).toBe("popup");
      expect(pane?.command).toEqual(["sh", "plugin/run-in-popup.sh", script]);
      expect(byId("actions", id)?.title).toBe(pane?.title);
    });
  }
});
