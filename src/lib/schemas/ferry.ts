import { z } from "zod";
import { uuid } from "./common";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** Money typed by a person in major units ("1,500", "1500.50"); converted with the route's currency. */
const majorAmount = z
  .string()
  .trim()
  .regex(/^\d{1,3}(,?\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/);

export const proposeJettySchema = z.object({
  orgId: uuid,
  name: z.string().trim().min(2).max(80),
  aliases: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const routeInputSchema = z.object({
  originJettyId: uuid,
  destinationJettyId: uuid,
  durationMin: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  distanceKm: z.coerce.number().positive().max(2000).optional(),
  baseFare: majorAmount,
});
export type RouteInput = z.infer<typeof routeInputSchema>;

export const scheduleInputSchema = z.object({
  routeId: uuid,
  vesselId: uuid,
  daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
  departureTime: timeString,
});
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export const adHocTripSchema = z
  .object({
    vesselId: uuid,
    routeId: uuid.optional(),
    originText: z.string().trim().min(2).max(80).optional(),
    destinationText: z.string().trim().min(2).max(80).optional(),
    clientId: z.string().min(8).max(64).optional(),
  })
  .refine((v) => v.routeId || (v.originText && v.destinationText), { message: "Choose a route or type both ends" });
export type AdHocTripInput = z.infer<typeof adHocTripSchema>;

export const manifestEntrySchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(24).optional(),
  ageBand: z.enum(["child", "adult", "senior"]).optional(),
  nextOfKinPhone: z.string().trim().max(24).optional(),
  seats: z.coerce.number().int().min(1).max(50).default(1),
  clientId: z.string().min(8).max(64).optional(),
});
export type ManifestEntryInput = z.infer<typeof manifestEntrySchema>;

export const tripActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("boarding") }),
  z.object({ action: z.literal("lifejackets"), confirmed: z.boolean() }),
  z.object({ action: z.literal("depart") }),
  z.object({ action: z.literal("arrive"), cash: majorAmount.optional(), notes: z.string().max(500).optional() }),
  z.object({ action: z.literal("cancel"), notes: z.string().max(500).optional() }),
]);

export const reportQuerySchema = z.object({ org_id: uuid, date: dateString.optional(), vessel_id: uuid.optional() });
export const exportQuerySchema = z.object({ org_id: uuid, from: dateString, to: dateString });
