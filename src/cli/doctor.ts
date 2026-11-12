// Executable entry point for the doctor CLI (see bin/herdr-gemini-cli.js).
// Keep this file free of exports: library consumers import from ../index.ts,
// which must not trigger any side effects on load.
import { runDoctor } from "./diagnostics.js";

runDoctor();
