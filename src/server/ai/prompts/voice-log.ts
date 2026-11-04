import { z } from "zod";
import type { BotContext } from "@/server/bot/parse";

/** §10.2 WhatsApp voice/text trip and sales logging. Bump the version when wording or schema change. */
export const VOICE_LOG_PROMPT_ID = "voice_log";
export const VOICE_LOG_PROMPT_VERSION = "voice-log@1";

const id = z.string().min(1).nullable();

export const voiceLogSchema = z.object({
  kind: z.enum(["trip_log", "expense", "fuel", "incident", "other"]),
  vessel_id: id,
  route_id: id,
  origin: z.string().nullable(),
  destination: z.string().nullable(),
  passenger_count: z.number().int().min(0).max(5000).nullable(),
  amount: z.number().min(0).nullable(),
  currency: z.string().length(3).nullable(),
  payment_method: z.string().nullable(),
  expense_category: z.string().nullable(),
  urgent: z.boolean(),
  summary_for_confirmation: z.string().min(1).max(500),
});

export interface VoiceLogPromptContext {
  countryName: string;
  languages: string;
  currency: string;
  bot: BotContext;
}

/** The system prompt from BUILD_SPEC §10.2, with the org's context. Context carries no personal data. */
export function voiceLogSystemPrompt(c: VoiceLogPromptContext): string {
  const vessels = c.bot.vessels.map((v) => ({ id: v.id, name: v.name }));
  const routes = c.bot.routes.map((r) => ({
    id: r.id,
    from: [r.origin, ...r.originAliases],
    to: [r.destination, ...r.destinationAliases],
  }));
  return `You turn a boat captain's message into a structured log. The captain works for a ferry or vessel
company in ${c.countryName}. Messages may be in ${c.languages} and may use local jetty names and
number words (for Nigeria: English or Pidgin; "twenty-seven k" = 27000 naira).
Context: vessels ${JSON.stringify(vessels)}, routes with aliases ${JSON.stringify(routes)}, open trips ${JSON.stringify(c.bot.openTrips)}.
Return JSON only. kind is one of "trip_log", "expense", "fuel", "incident", "other".
Amounts are integer major units of ${c.currency}. If a field is not in the message, return null. Do not invent values.
If the message reports danger, injury, capsizing, fire or a missing person, set kind = "incident"
and urgent = true.
CONTEXT_JSON ${JSON.stringify(c.bot)}`;
}
