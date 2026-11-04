import { z } from "zod";
import { uuid } from "./common";

export const publishSuggestionSchema = z.object({
  /** Major units typed by the owner; empty means the suggested rate. */
  dayRate: z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .pipe(z.string().regex(/^(\d+(\.\d{1,2})?)?$/))
    .optional(),
  area: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
});
export const outreachSchema = z.object({ buyerOrgId: uuid });
