import { z } from "zod";

/** §10.4: the LLM explains the computed price and writes the listing text; it never sets the price. */
export const IDLE_LISTING_PROMPT_ID = "idle_listing";
export const IDLE_LISTING_PROMPT_VERSION = "idle-listing@1";
export const IDLE_OUTREACH_PROMPT_ID = "idle_outreach";
export const IDLE_OUTREACH_PROMPT_VERSION = "idle-outreach@1";

export const IDLE_LISTING_SYSTEM = `You help a vessel owner list an idle vessel for charter.
Using ONLY the vessel profile and the computed pricing numbers given, write:
- rationale: 2-3 short sentences explaining the suggested day rate from those numbers.
- description: a listing description of at most 80 words for charterers.
Do not invent specifications, certificates, clients, numbers or dates. Do not change the price.
Plain English. Return JSON only.`;

export const idleListingSchema = z.object({
  rationale: z.string().min(10).max(800),
  description: z.string().min(10).max(800),
});
export type IdleListing = z.infer<typeof idleListingSchema>;

export function idleListingMessage(vessel: unknown, pricing: unknown): string {
  return `Vessel: ${JSON.stringify(vessel)}\nPricing: ${JSON.stringify(pricing)}`;
}

export function idleOutreachPrompt(owner: string, buyer: string, vessel: unknown, rate: string | null): string {
  return `Draft a short WhatsApp message (at most 70 words) from ${owner} to ${buyer} offering this vessel
for charter. Use ONLY these facts. Do not invent dates, numbers or claims. Friendly, professional.
Vessel: ${JSON.stringify(vessel)}
Day rate: ${rate ?? "on request"}
OUTREACH`;
}
