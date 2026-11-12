import { HerdrClient } from "../herdr/client.js";
import { spawnSync } from "child_process";

export function runDoctor(): void {
  const client = new HerdrClient();
  const env = client.getEnvironment();

  console.log("=== Herdr Gemini CLI Integration Doctor ===\n");
  console.log(`HERDR_ENV:          ${process.env.HERDR_ENV ?? "(not set)"}`);
  console.log(`HERDR_PANE_ID:      ${env.paneId ?? "(not set)"}`);
  console.log(`HERDR_BIN_PATH:     ${env.binPath ?? "(not set)"}`);
  console.log(`HERDR_SOCKET_PATH:   ${env.socketPath ?? "(not set)"}`);
  console.log(`Herdr Status:       ${env.isHerdr ? "ACTIVE (Running inside Herdr)" : "DORMANT (Outside Herdr)"}\n`);

  if (!env.isHerdr) {
    console.log("Status: The integration is currently dormant.");
    console.log("Note: This is expected when running Gemini CLI outside of a Herdr pane.");
    console.log("To use Herdr integration, start Gemini CLI inside a Herdr managed pane.");
    return;
  }

  console.log("Herdr binary check:");
  try {
    const res = spawnSync(env.binPath!, ["--version"], { encoding: "utf8" });
    if (res.error) {
      console.log(`  ❌ Failed to execute ${env.binPath}: ${res.error.message}`);
    } else {
      console.log(`  ✅ ${res.stdout.trim() || "Herdr binary accessible"}`);
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
    console.log(`  Executing: ${env.binPath} ${args.join(" ")}`);
    const reportRes = spawnSync(env.binPath!, args, { encoding: "utf8" });
    if (reportRes.status === 0) {
      console.log("  ✅ Test report delivered successfully to Herdr!");
    } else {
      console.log(`  ⚠️ Herdr reported exit code ${reportRes.status}: ${reportRes.stderr.trim()}`);
    }
  } catch (err: unknown) {
    console.log(`  ❌ Error testing report: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("\nDoctor check completed.");
}

if (require.main === module || require.main?.filename.endsWith("doctor.js") || require.main?.filename.endsWith("herdr-gemini-cli.js")) {
  runDoctor();
}
