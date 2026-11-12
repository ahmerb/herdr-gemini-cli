// Executable entry point invoked by Gemini CLI hooks (see hooks/hooks.json).
// Keep this file free of exports: library consumers import from ../index.ts,
// which must not trigger any side effects on load.
import { runHook } from "./runner.js";

void runHook();
