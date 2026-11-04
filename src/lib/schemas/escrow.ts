import { z } from "zod";

export const disputeSchema = z.object({ reason: z.string().trim().min(5).max(1000) });
export const resolveSchema = z
  .object({
    action: z.enum(["release", "refund", "split"]),
    owner_share_minor: z.coerce.bigint().min(0n).optional(),
  })
  .refine((v) => v.action !== "split" || v.owner_share_minor !== undefined, { path: ["owner_share_minor"] });
export const bankAccountSchema = z.object({
  bankCode: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z]{2,12}$/),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,20}$/),
  accountName: z.string().trim().min(2).max(120),
});
