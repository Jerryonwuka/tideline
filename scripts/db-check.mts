/** Proves Drizzle can reach the database: `pnpm db:check`. */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const client = postgres(url, { prepare: false, max: 1, connect_timeout: 5 });

try {
  const rows = await drizzle(client).execute<{ version: string }>(sql`select version() as version`);
  console.info(`Connected: ${rows[0]?.version}`);
} catch (error) {
  console.error(`Could not connect to the database: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
