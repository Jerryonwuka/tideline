import { z } from "zod";
import { countryCodeSchema, uuid } from "./common";

export const vesselTypeSchema = z.enum(["ferry", "crew_boat", "osv", "tug", "barge", "speedboat", "other"]);
export type VesselType = z.infer<typeof vesselTypeSchema>;
export const vesselStatusSchema = z.enum(["active", "maintenance", "idle", "on_charter", "laid_up"]);
export const crewRoleSchema = z.enum(["captain", "engineer", "deckhand", "ticket_agent", "other"]);
export type CrewRole = z.infer<typeof crewRoleSchema>;
export const subjectTypeSchema = z.enum(["vessel", "crew", "org"]);
export type SubjectType = z.infer<typeof subjectTypeSchema>;
export const documentStatusSchema = z.enum(["needs_review", "valid", "expiring", "expired", "rejected"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const vesselInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: vesselTypeSchema,
  registrationNo: text(60),
  imo: z
    .string()
    .trim()
    .regex(/^\d{7}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  mmsi: z
    .string()
    .trim()
    .regex(/^\d{9}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  flagCountryCode: countryCodeSchema.optional(),
  operatingCountryCode: countryCodeSchema.optional(),
  yearBuilt: int(1900, 2100).optional(),
  lengthM: z.coerce.number().positive().max(500).optional(),
  passengerCapacity: int(0, 5000).optional(),
  cargoCapacityT: z.coerce.number().min(0).max(100000).optional(),
  engine: text(120),
  crewComplement: int(0, 500).optional(),
  speedKn: z.coerce.number().min(0).max(80).optional(),
  deckSpaceM2: z.coerce.number().min(0).max(100000).optional(),
  dpClass: text(20),
  status: vesselStatusSchema.optional(),
  ferryEnabled: z.boolean().default(false),
  charterEnabled: z.boolean().default(false),
});
export type VesselInput = z.infer<typeof vesselInputSchema>;
export const vesselPatchSchema = vesselInputSchema.partial();

export const crewInputSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: text(24),
  crewRole: crewRoleSchema,
  emergencyContactName: text(120),
  emergencyContactPhone: text(24),
});
export type CrewInput = z.infer<typeof crewInputSchema>;
export const crewPatchSchema = crewInputSchema.partial().extend({ status: z.enum(["active", "inactive"]).optional() });

export const assignCrewSchema = z.object({ crewMemberId: uuid, fromDate: dateString.optional() });

export const uploadUrlSchema = z.object({
  orgId: uuid,
  subjectType: subjectTypeSchema,
  subjectId: uuid,
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]),
});

export const documentFieldsSchema = z.object({
  number: text(80),
  issuer: text(120),
  issueDate: dateString.optional().or(z.literal("").transform(() => undefined)),
  expiryDate: dateString.optional().or(z.literal("").transform(() => undefined)),
});

export const createDocumentSchema = documentFieldsSchema.extend({
  orgId: uuid,
  subjectType: subjectTypeSchema,
  subjectId: uuid,
  documentTypeCode: z.string().min(2).max(60),
  filePath: z.string().max(400).optional(),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const confirmDocumentSchema = documentFieldsSchema.extend({ reject: z.boolean().default(false) });
