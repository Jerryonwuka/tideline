import { z } from "zod";
import { uuid } from "./common";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Money typed by a person in major units, converted with the listing's currency. */
const major = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/));

export const listingInputSchema = z
  .object({
    vesselId: uuid,
    dayRate: major,
    minRate: major.optional(),
    minDays: z.coerce.number().int().min(1).max(365),
    operatingArea: z.string().trim().min(2).max(120),
    availableFrom: date.optional(),
    availableTo: date.optional(),
    description: z.string().trim().max(2000).optional(),
    status: z.enum(["draft", "live", "paused"]),
    publicDocumentIds: z.array(uuid).max(30).default([]),
  })
  .refine((v) => !v.availableFrom || !v.availableTo || v.availableFrom <= v.availableTo, { path: ["availableTo"] });
export type ListingInput = z.infer<typeof listingInputSchema>;

export const requestInputSchema = z
  .object({
    listingId: uuid.optional(),
    vesselType: z.string().max(40).optional(),
    startDate: date,
    endDate: date,
    location: z.string().trim().min(2).max(120),
    countryCode: z.string().length(2).optional(),
    purpose: z.string().trim().min(3).max(1000),
    crewNeeds: z.string().trim().max(500).optional(),
    budget: major.optional(),
    currency: z.string().length(3).optional(),
  })
  .refine((v) => v.startDate <= v.endDate, { path: ["endDate"] });
export type RequestInput = z.infer<typeof requestInputSchema>;

export const quoteInputSchema = z.object({
  vesselId: uuid,
  dayRate: major,
  mobilisation: major.optional(),
  fuelTerms: z.string().trim().max(300).optional(),
  paymentTerms: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
  validUntil: date,
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export const boardQuerySchema = z.object({
  type: z.string().max(40).optional(),
  area: z.string().max(80).optional(),
  from: date.optional(),
  to: date.optional(),
  min_capacity: z.coerce.number().int().min(0).max(10000).optional(),
});
