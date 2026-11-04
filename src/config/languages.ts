// How captains speak, per country, for speech-to-text hints and the voice-log prompt (§10.2).
// Countries not listed fall back to the user's locale.

export const COUNTRY_SPEECH: Record<string, { sttHints: string[]; description: string }> = {
  NG: { sttHints: ["en-NG", "pcm"], description: "English or Nigerian Pidgin" },
};

export function speechFor(countryCode: string, locale: string | null) {
  const c = COUNTRY_SPEECH[countryCode];
  return {
    sttHints: [...new Set([...(locale ? [locale] : []), ...(c?.sttHints ?? [])])],
    description: c?.description ?? locale ?? "English",
  };
}
