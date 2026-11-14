import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";

// Validates herdr-plugin.toml against the rules in
// https://herdr.dev/tui/docs/plugins/ (Herdr 0.9.5), so mistakes fail CI
// instead of `herdr plugin install`.

const ROOT = join(__dirname, "..", "..");
const readJson = (file: string) => JSON.parse(readFileSync(join(ROOT, file), "utf8"));

type Table = Record<string, unknown>;
const manifest = parse(readFileSync(join(ROOT, "herdr-plugin.toml"), "utf8")) as Table;
const section = (name: string): Table[] => (manifest[name] as Table[] | undefined) ?? [];

const PLUGIN_ID = /^[A-Za-z0-9.:_-]+$/;
const ITEM_ID = /^[A-Za-z0-9:_-]+$/; // action, pane and link handler ids: no dots
const PLATFORMS = new Set(["linux", "macos", "windows"]);
const PLACEMENTS = new Set(["overlay", "popup", "split", "tab", "zoomed"]);
const CONTEXTS = new Set(["global", "workspace", "tab", "pane", "selection"]);
const COMMAND_SECTIONS = ["build", "startup", "actions", "events", "panes"];

/** Every `command` in the manifest, labelled for error messages. */
function allCommands(): Array<{ where: string; command: unknown }> {
  return COMMAND_SECTIONS.flatMap((name) =>
    section(name).map((item, i) => ({
      where: `[[${name}]] #${i + 1}${item.id ? ` (${String(item.id)})` : ""}`,
      command: item.command,
    }))
  );
}

/**
 * Arguments that name files in this repo (e.g. `plugin/node.sh`,
 * `dist/plugin/commands/x.js`): relative, contain a slash, and are not shell
 * snippets or flags.
 */
function repoPathArgs(command: string[]): string[] {
  return command.filter(
    (arg) =>
      arg.includes("/") &&
      !arg.startsWith("/") &&
      !arg.startsWith("-") &&
      !/[\s$"'`;|&]/.test(arg)
  );
}

describe("herdr-plugin.toml", () => {
  it("has the required top-level fields", () => {
    expect(manifest.id).toBe("herdr-gemini-cli");
    expect(manifest.id).toMatch(PLUGIN_ID);
    for (const field of ["name", "version", "min_herdr_version"]) {
      expect(typeof manifest[field], field).toBe("string");
    }
    expect(manifest.min_herdr_version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("keeps version in sync with package.json and gemini-extension.json", () => {
    const pkg = readJson("package.json");
    const ext = readJson("gemini-extension.json");
    expect(manifest.version).toBe(pkg.version);
    expect(ext.version).toBe(pkg.version);
    expect(readJson("package-lock.json").version).toBe(pkg.version);
  });

  it("only uses known platforms", () => {
    const lists = [manifest, ...COMMAND_SECTIONS.flatMap(section), ...section("link_handlers")]
      .map((t) => t.platforms)
      .filter((p): p is string[] => p !== undefined);
    expect(manifest.platforms).toBeDefined();
    for (const list of lists) {
      for (const platform of list) {
        expect(PLATFORMS.has(platform), `platform ${platform}`).toBe(true);
      }
    }
  });

  it("uses valid, unique ids for actions, panes and link handlers", () => {
    for (const name of ["actions", "panes", "link_handlers"]) {
      const ids = section(name).map((item) => item.id);
      for (const id of ids) {
        expect(typeof id, `[[${name}]] id`).toBe("string");
        expect(id, `[[${name}]] id`).toMatch(ITEM_ID);
      }
      expect(new Set(ids).size, `duplicate [[${name}]] id`).toBe(ids.length);
    }
  });

  it("gives every action and pane a title, and uses valid contexts and placements", () => {
    for (const action of section("actions")) {
      expect(typeof action.title, `action ${String(action.id)} title`).toBe("string");
      for (const context of (action.contexts as string[] | undefined) ?? []) {
        expect(CONTEXTS.has(context), `action ${String(action.id)} context ${context}`).toBe(true);
      }
    }
    for (const pane of section("panes")) {
      expect(typeof pane.title, `pane ${String(pane.id)} title`).toBe("string");
      if (pane.placement !== undefined) {
        expect(PLACEMENTS.has(pane.placement as string), `pane ${String(pane.id)} placement`).toBe(true);
      }
    }
  });

  it("points every link handler at an action of this plugin", () => {
    const actionIds = new Set(section("actions").map((a) => a.id));
    for (const handler of section("link_handlers")) {
      expect(actionIds.has(handler.action), `link handler ${String(handler.id)}`).toBe(true);
    }
  });

  it("uses non-empty argv commands whose repo files exist", () => {
    const commands = allCommands();
    expect(commands.length).toBeGreaterThan(0);
    for (const { where, command } of commands) {
      expect(Array.isArray(command), `${where} command must be an argv array`).toBe(true);
      const argv = command as unknown[];
      expect(argv.length, `${where} command`).toBeGreaterThan(0);
      expect(argv.every((arg) => typeof arg === "string"), `${where} command`).toBe(true);
      for (const path of repoPathArgs(argv as string[])) {
        expect(existsSync(join(ROOT, path)), `${where}: ${path} does not exist`).toBe(true);
      }
    }
  });

  it("runs the Gemini extension install as a build step", () => {
    expect(section("build").map((b) => b.command)).toContainEqual([
      "sh",
      "plugin/install-extension.sh",
    ]);
  });
});
