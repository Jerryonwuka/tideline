import "server-only";
import { reportError } from "@/server/log";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z, ZodError } from "zod";
import { ServiceError } from "@/server/services/errors";

/** Error body shared by every endpoint: {error: {code, message, fields?}} (BUILD_SPEC §6). */
async function errorResponse(code: string, status: number, fields?: Record<string, string>) {
  const t = await getTranslations("errors");
  const message = t.has(code) ? t(code) : t("unknown");
  return NextResponse.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}

/** Wraps a route handler: validation and service errors become JSON errors; nothing leaks. */
export function route<C>(handler: (request: Request, ctx: C) => Promise<Response>) {
  return async (request: Request, ctx: C): Promise<Response> => {
    try {
      return await handler(request, ctx);
    } catch (err) {
      if (err instanceof ZodError) {
        const fields = Object.fromEntries(err.issues.map((i) => [i.path.join("."), i.message]));
        return errorResponse("validation", 422, fields);
      }
      if (err instanceof ServiceError) return errorResponse(err.code, err.status, err.fields);
      // No request data in logs (CLAUDE.md rule 10); the message is redacted.
      await reportError("api.unhandled", err, { path: new URL(request.url).pathname });
      return errorResponse("unknown", 500);
    }
  };
}

export async function parseJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ServiceError("validation", { body: "Invalid JSON" });
  }
  return schema.parse(body);
}

export function requireUuid(value: string): string {
  return z.uuid().parse(value);
}
