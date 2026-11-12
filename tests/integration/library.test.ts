import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";

const libraryEntry = path.resolve(__dirname, "../../dist/index.js");

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "herdr-library-test-"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("library entry (dist/index.js)", () => {
  // These names previously matched the auto-run guards that were bundled into
  // dist/index.js, so requiring the library ran runDoctor()/runHook().
  it.each(["doctor.js", "dispatcher.js", "herdr-gemini-cli.js"])(
    "has no side effects when required from a script named %s",
    (scriptName) => {
      const script = path.join(tmp, scriptName);
      writeFileSync(
        script,
        [
          `const lib = require(${JSON.stringify(libraryEntry)});`,
          `if (typeof lib.runDoctor !== "function") throw new Error("runDoctor missing");`,
          `if (typeof lib.runHook !== "function") throw new Error("runHook missing");`,
          `if (typeof lib.HerdrClient !== "function") throw new Error("HerdrClient missing");`,
          `process.stdout.write("loaded");`,
        ].join("\n")
      );

      const res = spawnSync("node", [script], {
        input: JSON.stringify({ hook_event_name: "BeforeAgent" }),
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          HERDR_ENV: "1",
          HERDR_PANE_ID: "pane-lib-test",
          HERDR_BIN_PATH: "/bin/echo",
        },
      });

      expect(res.error).toBeUndefined();
      expect(res.status).toBe(0);
      expect(res.stderr).toBe("");
      expect(res.stdout).toBe("loaded");
    }
  );
});
