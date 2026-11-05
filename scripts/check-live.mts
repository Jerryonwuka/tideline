// Checks the live vendor keys (read-only: sends no messages and spends no AI tokens).
// Usage: pnpm check:live [env file]   e.g. after `vercel env pull .env.production.local --environment=production`
import { config } from "dotenv";

const file = process.argv[2];
config({ path: file ? [file] : [".env.local", ".env"], quiet: true });

const { serverEnv } = await import("../src/server/env");
const { checkLiveIntegrations } = await import("../src/server/integrations/live-check");

const results = await checkLiveIntegrations(serverEnv());
for (const r of results) console.log(`${r.ok ? "OK  " : "FAIL"}  ${r.service.padEnd(26)} ${r.detail}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
