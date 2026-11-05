import { z } from "zod";
import { SECTIONS } from "@/lib/tenders";

export const tenderInputSchema = z.object({
  title: z.string().trim().min(3).max(200),
  clientName: z.string().trim().max(200).optional(),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  text: z.string().trim().max(200_000).default(""),
});
export const sectionSchema = z.object({ section: z.enum(SECTIONS), text: z.string().max(20_000) });
export const mappingSchema = z.object({
  requirementId: z.string().min(1).max(40),
  documentId: z.string().uuid().nullable(),
});
export const vesselsSchema = z.object({ vesselIds: z.array(z.string().uuid()).max(20) });
