import "server-only";
import { FakeErrorReporter } from "@/server/integrations/errors/fake";
import { SentryErrorReporter } from "@/server/integrations/errors/sentry";
import type { ErrorReporter } from "@/server/integrations/errors/types";
import { hashPhone } from "@/server/privacy";

// PII-free logging (§12, rule 10). Everything that leaves the process goes through redact():
// phone numbers become phone#<hash>, emails and long digit runs (account, ID numbers) are masked.

const PHONE = /\+?\d[\d\s-]{8,16}\d/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function redact(text: string): string {
  return text.replace(EMAIL, "[email]").replace(PHONE, (m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 ? `phone#${hashPhone(`+${digits}`)}` : "[number]";
  });
}

const g = globalThis as unknown as { __tidelineReporter?: ErrorReporter };

export function errorReporter(): ErrorReporter {
  if (!g.__tidelineReporter) {
    const dsn = process.env.SENTRY_DSN;
    g.__tidelineReporter = dsn
      ? new SentryErrorReporter(dsn, process.env.APP_ENV ?? "local", process.env.VERCEL_GIT_COMMIT_SHA)
      : new FakeErrorReporter();
  }
  return g.__tidelineReporter;
}

export function setErrorReporterForTesting(r: ErrorReporter | undefined) {
  g.__tidelineReporter = r;
}

type Tags = Record<string, string | number | boolean | null | undefined>;
const clean = (tags?: Tags) =>
  Object.fromEntries(
    Object.entries(tags ?? {})
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, redact(String(v)).slice(0, 200)]),
  );

/** A failure worth a human's attention: logged (redacted) and sent to error monitoring. */
export async function reportError(event: string, err: unknown, tags?: Tags): Promise<void> {
  const e =
    err instanceof Error
      ? { name: err.name, message: redact(err.message).slice(0, 500), stack: err.stack ? redact(err.stack) : undefined }
      : { name: typeof err, message: redact(String(err)).slice(0, 500) };
  const t = clean(tags);
  console.error(`[${event}]`, e.name, e.message, Object.keys(t).length ? JSON.stringify(t) : "");
  await errorReporter().capture({ event, error: e, tags: t });
}

export function logInfo(event: string, tags?: Tags): void {
  console.info(`[${event}]`, JSON.stringify(clean(tags)));
}
