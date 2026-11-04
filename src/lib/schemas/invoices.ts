import { z } from "zod";
import { uuid } from "./common";

const major = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/));

export const invoiceInputSchema = z.object({
  charterId: uuid.optional(),
  currency: z.string().length(3).optional(),
  billTo: z.object({
    name: z.string().trim().min(2).max(160),
    org_id: uuid.optional(),
    address: z.string().trim().max(400).optional(),
  }),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(300),
        quantity: z.coerce.number().min(0).max(100000),
        unitPrice: major,
        kind: z.enum(["charge", "discount"]).default("charge"),
      }),
    )
    .min(1)
    .max(50),
  addVat: z.boolean().default(false),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export const sendInvoiceSchema = z
  .object({ whatsapp: z.string().trim().max(24).optional(), email: z.email().optional() })
  .refine((v) => v.whatsapp || v.email, { path: ["whatsapp"] });

export const recordPaymentSchema = z.object({ amount: major, method: z.enum(["cash", "transfer"]) });

export const offPlatformCharterSchema = z
  .object({
    vesselId: uuid,
    clientName: z.string().trim().min(2).max(160),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dayRate: major,
    mobilisation: major.optional(),
  })
  .refine((v) => v.startDate <= v.endDate, { path: ["endDate"] });
