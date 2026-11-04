import { z } from "zod";
import { uuid } from "./common";

export const ticketPurchaseSchema = z.object({
  tripId: uuid,
  qty: z.coerce.number().int().min(1).max(20),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(24).optional(),
});

export const agentSaleSchema = ticketPurchaseSchema.omit({ tripId: true }).extend({
  method: z.enum(["cash", "transfer"]),
});

export const ticketCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{8}$/);

export const boardSchema = z.object({ code: ticketCodeSchema, tripId: uuid.optional() });
export const subscribeSchema = z.object({ planCode: z.string().min(2).max(40) });
