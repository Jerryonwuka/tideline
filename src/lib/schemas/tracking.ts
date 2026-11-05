import { z } from "zod";
import { uuid } from "./common";

export const positionSchema = z.object({
  client_id: uuid,
  /** Trip by server id or the client_id it was created with offline. */
  trip: uuid,
  recorded_at: z.iso.datetime({ offset: true }),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed_kn: z.number().min(0).max(100).nullish(),
  accuracy_m: z.number().min(0).max(100_000).nullish(),
});
export type PositionInput = z.infer<typeof positionSchema>;

export const positionsBatchSchema = z.object({ org_id: uuid, points: z.array(positionSchema).min(1).max(500) });
