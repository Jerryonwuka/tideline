import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Row-level security and database-backed job tests: real SQL against local Supabase (pnpm db:start).
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./tests/unit/stubs/empty.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/rls/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    env: { NODE_ENV: "test", INTEGRATIONS_MODE: "fake" },
  },
});
