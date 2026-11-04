import { defineConfig } from "vitest/config";

// Row-level security tests: real SQL against the local Supabase database (pnpm db:start).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/rls/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
