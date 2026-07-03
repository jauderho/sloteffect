import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // bench/run.ts copies src/ (tests included) into bench/.work for A/B
    // benchmarking — those copies must not run as part of the suite.
    exclude: ["**/node_modules/**", "bench/.work/**"],
  },
});
