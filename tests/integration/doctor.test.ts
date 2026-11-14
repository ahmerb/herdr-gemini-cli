import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import * as path from "path";

const doctorScript = path.resolve(__dirname, "../../dist/cli/doctor.js");

describe("doctor CLI integration", () => {
  it("runs cleanly in dormant mode without error", () => {
    const res = spawnSync("node", [doctorScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        HERDR_ENV: "0",
        HERDR_PANE_ID: "",
        HERDR_BIN_PATH: "",
      },
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Herdr Status:       DORMANT");
    expect(res.stdout).toContain("Status: The integration is currently dormant.");
  });

  it("detects active Herdr environment", () => {
    const res = spawnSync("node", [doctorScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        HERDR_ENV: "1",
        HERDR_PANE_ID: "pane-xyz",
        HERDR_BIN_PATH: "/bin/echo",
      },
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Herdr Status:       ACTIVE");
    expect(res.stdout).toContain("HERDR_PANE_ID:      pane-xyz");
  });
});

describe("plugin doctor command integration", () => {
  const pluginDoctor = path.resolve(__dirname, "../../dist/plugin/commands/doctor.js");

  it("runs every check and exits without waiting when stdin is not a TTY", () => {
    const res = spawnSync("node", [pluginDoctor], {
      encoding: "utf8",
      input: "",
      timeout: 30000,
      env: {
        PATH: process.env.PATH,
        HERDR_BIN_PATH: "/usr/bin/false",
        HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ focused_pane_id: "w9:p9" }),
      },
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("=== Herdr Gemini CLI doctor (plugin ");
    expect(res.stdout).toContain("❌ Herdr: /usr/bin/false --version failed");
    expect(res.stdout).toContain("❌ Herdr socket:");
    expect(res.stdout).toContain("➖ Test report: skipped (w9:p9 is not a gemini-cli agent pane");
    expect(res.stdout).toMatch(/(✅|❌) Gemini CLI:/);
    expect(res.stdout).toContain("Press any key to close");
  });
});
