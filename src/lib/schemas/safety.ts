import { z } from "zod";
import { uuid } from "./common";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** An org's safety limits. The database also refuses anything looser than the country defaults. */
export const thresholdsInputSchema = z
  .object({
    maxWindKmh: z.coerce.number().positive().max(200),
    maxGustKmh: z.coerce.number().positive().max(250),
    maxWaveM: z.coerce.number().positive().max(20),
    maxPrecipMmH: z.coerce.number().positive().max(200),
    nightBlock: z.coerce.boolean(),
    permittedStart: hhmm.nullish(),
    permittedEnd: hhmm.nullish(),
  })
  .refine((v) => !v.permittedStart || !v.permittedEnd || v.permittedStart < v.permittedEnd, {
    path: ["permittedEnd"],
  });
export type ThresholdsInput = z.infer<typeof thresholdsInputSchema>;

export const overrideRequestSchema = z.object({ note: z.string().trim().max(500).optional() });
export const overrideDecisionSchema = z.object({
  decision: z.enum(["approved", "declined"]),
  reason: z.string().trim().min(3).max(500),
});
export const pendingQuerySchema = z.object({ org_id: uuid });
