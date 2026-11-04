import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url: string) {
  // prepare: false keeps us compatible with Supabase's transaction pooler.
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

let instance: Db | undefined;

/**
 * Server-side database handle. Connects as the configured role, which bypasses RLS on the direct
 * connection, so request handlers must scope every query by org. User-facing reads go through the
 * Supabase client with the user's JWT so RLS applies.
 */
export function db(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  instance ??= createDb(url);
  return instance;
}
