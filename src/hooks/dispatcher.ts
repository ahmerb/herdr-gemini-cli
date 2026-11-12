import { handleHook } from "./handler.js";
import { GeminiHookInput } from "../types/gemini.js";

export async function readStdin(): Promise<string> {
  return new Promise<string>((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", (chunk) => {
      data += chunk;
    });

    process.stdin.on("end", () => {
      resolve(data);
    });

    process.stdin.on("error", () => {
      resolve("");
    });
  });
}

export async function runHook(): Promise<void> {
  try {
    const rawInput = await readStdin();
    if (!rawInput.trim()) {
      process.stdout.write(JSON.stringify({}) + "\n");
      return;
    }

    let parsed: GeminiHookInput;
    try {
      parsed = JSON.parse(rawInput) as GeminiHookInput;
    } catch {
      process.stdout.write(JSON.stringify({}) + "\n");
      return;
    }

    const output = await handleHook(parsed);
    process.stdout.write(JSON.stringify(output ?? {}) + "\n");
  } catch {
    // Fail-safe: Always output valid JSON and exit 0 so Gemini CLI is never blocked
    process.stdout.write(JSON.stringify({}) + "\n");
  }
}

if (require.main === module || require.main?.filename.endsWith("dispatcher.js")) {
  runHook();
}
