import type { ErrorEvent, ErrorReporter } from "./types";

/** Keeps the last events in memory (local dev and tests). */
export class FakeErrorReporter implements ErrorReporter {
  readonly events: ErrorEvent[] = [];
  async capture(e: ErrorEvent): Promise<void> {
    this.events.push(e);
    if (this.events.length > 200) this.events.shift();
  }
}
