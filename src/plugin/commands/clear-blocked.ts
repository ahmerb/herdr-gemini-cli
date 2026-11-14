// Entry point for the herdr-gemini-cli.clear-blocked plugin action.
// Logic lives in ../clear-blocked.ts; keep this file free of exports.
import { clearBlocked } from "../clear-blocked.js";

void clearBlocked().catch((error: unknown) => {
  console.error(`herdr-gemini-cli clear-blocked: ${String(error)}`);
  process.exitCode = 1;
});
