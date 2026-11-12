import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/hooks/dispatcher.ts",
    "src/cli/doctor.ts",
  ],
  format: ["cjs"],
  dts: true,
  clean: false,
  target: "node18",
  sourcemap: true,
  shims: true,
});
