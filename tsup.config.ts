import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/hooks/dispatcher.ts",
    "src/cli/doctor.ts",
    // Herdr plugin command entry points (run via plugin/node.sh). Keep them
    // free of exports, like the dispatcher; put testable logic in src/plugin/.
    "src/plugin/commands/*.ts",
  ],
  format: ["cjs"],
  dts: true,
  clean: false,
  target: "node18",
  sourcemap: true,
  shims: true,
});
