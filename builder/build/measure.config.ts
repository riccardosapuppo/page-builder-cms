// The measurements, run apart from the tests so they never slow the suite
// or fail it on a busy machine: `npx vitest run --config build/measure.config.ts`.
// They need the compiled validator and the nesting rule, so the same
// plugin as the build.
import { defineConfig } from "vitest/config";
import { builderRoot } from "./paths.ts";
import { documentValidator } from "./validator.ts";

export default defineConfig({
  root: builderRoot,
  plugins: [documentValidator()],
  test: {
    include: ["test/**/*.measure.ts"],
    environment: "node",
    // The numbers are the output.
    silent: false,
    testTimeout: 300_000,
  },
});
