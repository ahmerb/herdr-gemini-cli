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
