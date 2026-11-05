import type { SttClient, TranscribeRequest, Transcript } from "./types";

const EXTENSIONS: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "m4a",
  "audio/amr": "amr",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

/** Words the model should expect in Lagos voice notes; improves spelling of places and units. */
const VOCABULARY =
  "Nigerian English and Pidgin. Trip, passengers, naira, jetty, CMS, Ikorodu, Badore, Ebute, fuel, litres.";

/**
 * OpenAI speech-to-text (Whisper). WhatsApp voice notes are Ogg/Opus, which the API accepts.
 * Pidgin has no language code there, so only English hints are passed; the vocabulary prompt helps.
 */
export class OpenAiSttClient implements SttClient {
  constructor(
    private readonly options: { apiKey: string; model: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async transcribe(req: TranscribeRequest): Promise<Transcript> {
    const mime = req.mimeType.split(";")[0]!.trim();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(req.audio)], { type: mime }), `voice.${EXTENSIONS[mime] ?? "ogg"}`);
    form.append("model", this.options.model);
    form.append("prompt", VOCABULARY);
    const english = req.languageHints.find((h) => h.toLowerCase().startsWith("en"));
    if (english) form.append("language", "en");
    const verbose = this.options.model === "whisper-1";
    form.append("response_format", verbose ? "verbose_json" : "json");

    const res = await this.fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`stt: ${res.status}`);
    const json = (await res.json()) as { text: string; language?: string; duration?: number };
    return {
      text: json.text.trim(),
      ...(json.language ? { language: json.language } : {}),
      ...(json.duration !== undefined ? { durationSec: json.duration } : {}),
      model: this.options.model,
    };
  }
}
