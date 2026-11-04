import { defineConfig, devices } from "@playwright/test";

// Port 3000: the local Supabase send-SMS hook delivers login codes to this app on that port.
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // The landing page lazy-loads three.js; give a cold dev server time to compile it.
  timeout: 60_000,
  expect: { timeout: 20_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // Reduced motion keeps the 3D scenes on demand-only rendering, so software WebGL in CI stays light.
  use: { baseURL, trace: "on-first-retry", reducedMotion: "reduce" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Captain screens target low-cost Android phones.
    { name: "android", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: process.env.CI ? `pnpm start -p ${port}` : `pnpm dev -p ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { INTEGRATIONS_MODE: "fake" },
  },
});
