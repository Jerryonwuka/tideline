import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  // Generated SQL lands next to hand-written RLS migrations, named the way the Supabase CLI expects.
  out: "./supabase/migrations",
  migrations: { prefix: "supabase" },
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" },
  schemaFilter: ["public"],
  strict: true,
  verbose: true,
});
