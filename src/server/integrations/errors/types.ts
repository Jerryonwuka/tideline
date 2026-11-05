export interface ErrorEvent {
  /** Short, stable name for the failure ("webhook.payment", "api.unhandled"). */
  event: string;
  /** Error class and message, already redacted. */
  error: { name: string; message: string; stack?: string };
  /** Non-personal context only (ids, codes, counts). */
  tags?: Record<string, string>;
}

/** Error monitoring (Sentry in staging/production). Callers pass redacted data only. */
export interface ErrorReporter {
  capture(e: ErrorEvent): Promise<void>;
}
