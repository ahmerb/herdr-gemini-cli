import { HerdrClient } from "../herdr/client.js";
import { spawnSync, type SpawnSyncReturns } from "child_process";

/** Upper bound for each Herdr invocation the doctor makes. */
export const DOCTOR_TIMEOUT_MS = 5000;

/** The parts of a spawnSync result the doctors look at. */
export type CommandResult = Pick<
  SpawnSyncReturns<string>,
  "status" | "signal" | "stdout" | "stderr" | "error"
>;

/** Runs a command to completion; injectable so doctors can be unit tested. */
export type CommandRunner = (
  command: string,
  args: string[],
  timeoutMs: number
) => CommandResult;

/**
 * Default CommandRunner: spawnSync with a timeout and no stdin, so a child
 * can never wait on (or steal) the terminal's input.
 */
export const runCommand: CommandRunner = (command, args, timeoutMs) =>
  spawnSync(command, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
  });

export interface DoctorOptions {
  client?: HerdrClient;
  timeoutMs?: number;
}

/**
 * Returns a human-readable description of why a spawnSync call failed, or
 * null if the process ran and exited with status 0.
 */
export function describeSpawnFailure(
  res: CommandResult,
  timeoutMs: number
): string | null {
  if (res.error) {
    const code = (res.error as NodeJS.ErrnoException).code;
    if (code === "ETIMEDOUT") {
      return `timed out after ${timeoutMs}ms`;
    }
    return res.error.message;
  }
  if (res.signal) {
    return `killed by signal ${res.signal}`;
  }
  if (res.status !== 0) {
    const stderr = (res.stderr ?? "").trim();
    return `exited with code ${res.status}${stderr ? `: ${stderr}` : ""}`;
  }
  return null;
}

export function runDoctor(options: DoctorOptions = {}): void {
  const client = options.client ?? new HerdrClient();
  const timeoutMs = options.timeoutMs ?? DOCTOR_TIMEOUT_MS;
  const env = client.getEnvironment();

  console.log("=== Herdr Gemini CLI Integration Doctor ===\n");
  console.log(`HERDR_ENV:          ${process.env.HERDR_ENV ?? "(not set)"}`);
  console.log(`HERDR_PANE_ID:      ${env.paneId ?? "(not set)"}`);
  console.log(`HERDR_BIN_PATH:     ${env.binPath ?? "(not set)"}`);
  console.log(`HERDR_SOCKET_PATH:   ${env.socketPath ?? "(not set)"}`);
  console.log(`Herdr Status:       ${env.isHerdr ? "ACTIVE (Running inside Herdr)" : "DORMANT (Outside Herdr)"}\n`);

  if (!env.isHerdr || !env.binPath) {
    console.log("Status: The integration is currently dormant.");
    console.log("Note: This is expected when running Gemini CLI outside of a Herdr pane.");
    console.log("To use Herdr integration, start Gemini CLI inside a Herdr managed pane.");
    return;
  }

  const binPath = env.binPath;

  console.log("Herdr binary check:");
  try {
    const res = spawnSync(binPath, ["--version"], {
      encoding: "utf8",
      timeout: timeoutMs,
    });
    const failure = describeSpawnFailure(res, timeoutMs);
    if (failure) {
      console.log(`  ❌ Failed to execute ${binPath}: ${failure}`);
    } else {
      console.log(`  ✅ ${(res.stdout ?? "").trim() || "Herdr binary accessible"}`);
    }
  } catch (err: unknown) {
    console.log(`  ❌ Failed to check Herdr binary: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("\nTesting agent report ping (state: idle)...");
  try {
    const testSeq = client.nextSeq();
    const args = client.buildReportArgs({
      state: "idle",
      seq: testSeq,
    });
    console.log(`  Executing: ${binPath} ${args.join(" ")}`);
    const reportRes = spawnSync(binPath, args, {
      encoding: "utf8",
      timeout: timeoutMs,
    });
    const failure = describeSpawnFailure(reportRes, timeoutMs);
    if (failure) {
      console.log(`  ⚠️ Test report failed: ${failure}`);
    } else {
      console.log("  ✅ Test report delivered successfully to Herdr!");
    }
  } catch (err: unknown) {
    console.log(`  ❌ Error testing report: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("\nDoctor check completed.");
}
