// Entry point for the "Gemini: doctor" popup (herdr-plugin.toml [[panes]]
// "doctor"). Keep this file free of exports; the logic is in ../doctor.ts.
import * as path from "path";
import { runPluginDoctor } from "../doctor.js";

// Built to dist/plugin/commands/doctor.js, three levels below the plugin root.
runPluginDoctor({ rootDir: path.resolve(__dirname, "..", "..", "..") }).catch((err: unknown) => {
  console.error(`herdr-gemini-cli doctor failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
