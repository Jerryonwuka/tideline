import { z } from "zod";

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  locale: z.string().max(10).optional(),
  timeZone: z.string().max(64).optional(),
  whatsappOptIn: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
