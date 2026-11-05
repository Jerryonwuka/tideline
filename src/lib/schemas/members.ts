import { z } from "zod";
import { phoneInputSchema, roleSchema } from "./common";

/** Roles an org can invite into. Charterer accounts arrive with charter mode (M11). */
export const invitableRoleSchema = roleSchema.exclude(["charterer"]);

export const inviteSchema = z.object({
  phone: phoneInputSchema,
  role: invitableRoleSchema,
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const updateMembershipSchema = z
  .object({
    role: invitableRoleSchema.optional(),
    status: z.enum(["active", "suspended"]).optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, { message: "Nothing to change" });
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,64}$/);
