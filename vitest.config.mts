import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // "server-only" throws outside a React Server Components build; unit tests import server code directly.
    alias: { "server-only": fileURLToPath(new URL("./tests/unit/stubs/empty.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    env: { NODE_ENV: "test", INTEGRATIONS_MODE: "fake" },
  },
});
