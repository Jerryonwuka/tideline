export interface TranscribeRequest {
  audio: Uint8Array;
  mimeType: string;
  /** BCP 47 hints, most likely first, e.g. ["en-NG", "pcm"]. Come from the user's locale and country. */
  languageHints: string[];
}

export interface Transcript {
  text: string;
  language?: string;
  durationSec?: number;
  model: string;
}

export interface SttClient {
  transcribe(req: TranscribeRequest): Promise<Transcript>;
}
