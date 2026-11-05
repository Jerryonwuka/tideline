import { z } from "zod";
import { phoneInputSchema } from "./common";

export const otpSendSchema = z.object({ phone: phoneInputSchema });
export const otpVerifySchema = z.object({
  phone: phoneInputSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
