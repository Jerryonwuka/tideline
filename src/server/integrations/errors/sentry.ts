import type { ErrorEvent, ErrorReporter } from "./types";

/**
 * Sentry over its envelope HTTP API (no SDK: rule 5 keeps vendors behind interfaces, and this keeps
 * the bundle small). Events carry no personal data: callers redact, and we send no user or IP.
 */
export class SentryErrorReporter implements ErrorReporter {
  private readonly url: string;
  private readonly key: string;

  constructor(
    dsn: string,
    private readonly environment: string,
    private readonly release?: string,
  ) {
    const u = new URL(dsn);
    this.key = u.username;
    const project = u.pathname.replace(/^\//, "");
    this.url = `${u.protocol}//${u.host}/api/${project}/envelope/`;
  }

  async capture(e: ErrorEvent): Promise<void> {
    const eventId = globalThis.crypto.randomUUID().replace(/-/g, "");
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "node",
      level: "error",
      environment: this.environment,
      release: this.release,
      transaction: e.event,
      tags: { event: e.event, ...e.tags },
      exception: { values: [{ type: e.error.name, value: e.error.message }] },
      extra: e.error.stack ? { stack: e.error.stack.slice(0, 4000) } : undefined,
    };
    const body = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
    try {
      await fetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/x-sentry-envelope",
          "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${this.key}, sentry_client=tideline/1.0`,
        },
        body,
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // Monitoring must never break the request that failed.
    }
  }
}
