import { describe, expect, it } from "vitest";
import { herdrBin, readPluginContext } from "./context.js";

// Shape captured from a real `herdr plugin action invoke` on herdr 0.9.5.
const REAL_CONTEXT = {
  correlation_id: "cli:plugin",
  focused_pane_agent: "gemini-cli",
  focused_pane_cwd: "/Users/me/project",
  focused_pane_id: "w3:p1",
  focused_pane_status: "blocked",
  invocation_source: "cli",
  tab_id: "w3:t1",
  tab_label: "1",
  workspace_cwd: "/Users/me/project",
  workspace_id: "w3",
  workspace_label: "project",
};

describe("readPluginContext", () => {
  it("parses a real Herdr invocation context", () => {
    const ctx = readPluginContext({
      HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify(REAL_CONTEXT),
    });

    expect(ctx).toMatchObject(REAL_CONTEXT);
    expect(ctx?.clicked_url).toBeNull();
    expect(ctx?.selected_text).toBeNull();
  });

  it("returns null when the variable is missing or empty", () => {
    expect(readPluginContext({})).toBeNull();
    expect(readPluginContext({ HERDR_PLUGIN_CONTEXT_JSON: "" })).toBeNull();
  });

  it("returns null for invalid JSON or non-object JSON", () => {
    expect(readPluginContext({ HERDR_PLUGIN_CONTEXT_JSON: "{not json" })).toBeNull();
    expect(readPluginContext({ HERDR_PLUGIN_CONTEXT_JSON: "[]" })).toBeNull();
    expect(readPluginContext({ HERDR_PLUGIN_CONTEXT_JSON: "null" })).toBeNull();
    expect(readPluginContext({ HERDR_PLUGIN_CONTEXT_JSON: '"w1:p1"' })).toBeNull();
  });

  it("treats wrongly typed or unknown-status fields as absent", () => {
    const ctx = readPluginContext({
      HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({
        focused_pane_id: 42,
        focused_pane_agent: null,
        focused_pane_status: "exploded",
        workspace_id: "w1",
      }),
    });

    expect(ctx?.focused_pane_id).toBeNull();
    expect(ctx?.focused_pane_agent).toBeNull();
    expect(ctx?.focused_pane_status).toBeNull();
    expect(ctx?.workspace_id).toBe("w1");
  });
});

describe("binary resolution", () => {
  it("uses HERDR_BIN_PATH and falls back to PATH lookup", () => {
    expect(herdrBin({ HERDR_BIN_PATH: "/x/herdr" })).toBe("/x/herdr");
    expect(herdrBin({})).toBe("herdr");
  });
});
