import { z } from "zod";
import { countryCodeSchema } from "./common";

export const launchStatusSchema = z.enum(["planned", "validating", "pilot", "live"]);

export const updateCountrySchema = z
  .object({
    enabled: z.boolean().optional(),
    launchStatus: launchStatusSchema.optional(),
    defaultCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    defaultLocale: z.string().min(2).max(10).optional(),
    defaultTimeZone: z.string().min(3).max(64).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to change" });
export type UpdateCountryInput = z.infer<typeof updateCountrySchema>;

export const requirementsQuerySchema = z.object({
  country: countryCodeSchema,
  vessel_type: z.string().min(2).max(40),
  modes: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter(Boolean) : [])),
});

export const publishRuleSetSchema = z.object({ note: z.string().trim().max(500).optional() });
