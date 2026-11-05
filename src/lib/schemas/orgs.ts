import { z } from "zod";
import { countryCodeSchema, modeSchema, orgTypeSchema } from "./common";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: orgTypeSchema,
  countryCode: countryCodeSchema,
  modes: z.array(modeSchema).min(1).max(3),
  registrationNumber: optionalText(60),
  region: optionalText(80),
  address: optionalText(240),
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const updateOrgSchema = createOrgSchema.omit({ countryCode: true }).partial();
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
