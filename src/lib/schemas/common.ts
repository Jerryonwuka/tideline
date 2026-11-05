import { z } from "zod";

export const uuid = z.uuid();
export const roleSchema = z.enum(["owner", "manager", "captain", "crew", "charterer"]);
export type Role = z.infer<typeof roleSchema>;
export const orgTypeSchema = z.enum(["ferry_operator", "vessel_owner", "charterer", "barge_operator"]);
export type OrgType = z.infer<typeof orgTypeSchema>;
export const modeSchema = z.enum(["ferry", "charter", "barge"]);
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/);
export const e164Schema = z.string().regex(/^\+[1-9]\d{6,14}$/);

/** Phone as typed by a person; normalised to E.164 by the service layer. */
export const phoneInputSchema = z.string().trim().min(6).max(24);
