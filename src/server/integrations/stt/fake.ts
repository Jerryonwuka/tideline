import { createHash } from "node:crypto";
import type { SttClient, TranscribeRequest, Transcript } from "./types";

/** Returns the transcript registered for the exact audio bytes (keyed by SHA-256). */
export class FakeSttClient implements SttClient {
  private readonly transcripts = new Map<string, string>();

  register(audio: Uint8Array, text: string): this {
    this.transcripts.set(digest(audio), text);
    return this;
  }

  async transcribe(req: TranscribeRequest): Promise<Transcript> {
    const text = this.transcripts.get(digest(req.audio));
    if (text === undefined) throw new Error("FakeSttClient: no transcript registered for this audio");
    return { text, language: req.languageHints[0], model: "fake-stt" };
  }
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
