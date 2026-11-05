import type { PostgrestError } from "@supabase/supabase-js";

/** Stable error codes; the UI translates them (messages/*.json → errors.*). */
export const ERROR_CODES = [
  "not_authenticated",
  "forbidden",
  "not_found",
  "validation",
  "invalid_phone",
  "invalid_code",
  "rate_limited",
  "invalid_name",
  "invalid_country",
  "invalid_modes",
  "already_member",
  "invitation_not_found",
  "invitation_used",
  "invitation_expired",
  "phone_mismatch",
  "last_owner",
  "admin_only_field",
  "immutable_membership",
  "delivery_failed",
  "country_not_ready",
  "not_draft",
  "invalid_time_zone",
  "invalid_subject",
  "capacity_exceeded",
  "manifest_locked",
  "trip_closed",
  "invalid_transition",
  "lifejackets_unconfirmed",
  "immutable_trip",
  "safety_check_required",
  "safety_unacknowledged",
  "safety_blocked",
  "thresholds_too_loose",
  "not_overridable",
  "already_requested",
  "already_decided",
  "ticket_not_found",
  "ticket_wrong_trip",
  "ticket_used",
  "ticket_not_paid",
  "currency_mismatch",
  "payments_unavailable",
  "billing_read_only",
  "quote_expired",
  "contract_locked",
  "escrow_disabled",
  "escrow_disputed",
  "nothing_to_release",
  "already_released",
  "tender_not_reviewed",
  "tender_blocked",
  "tender_no_text",
  "rate_below_minimum",
  "request_already_open",
  "request_closed",
  "sole_owner",
  "reason_required",
  "unknown",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS: Partial<Record<ErrorCode, number>> = {
  not_authenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  invalid_phone: 422,
  invalid_code: 422,
  invalid_name: 422,
  invalid_country: 422,
  invalid_modes: 422,
  rate_limited: 429,
  already_member: 409,
  invitation_used: 409,
  invitation_expired: 410,
  invitation_not_found: 404,
  phone_mismatch: 403,
  last_owner: 409,
  admin_only_field: 403,
  immutable_membership: 409,
  delivery_failed: 502,
  country_not_ready: 409,
  not_draft: 409,
  invalid_time_zone: 422,
  invalid_subject: 422,
  capacity_exceeded: 409,
  manifest_locked: 409,
  trip_closed: 409,
  invalid_transition: 409,
  lifejackets_unconfirmed: 409,
  immutable_trip: 409,
  safety_check_required: 409,
  safety_unacknowledged: 409,
  safety_blocked: 409,
  thresholds_too_loose: 422,
  not_overridable: 409,
  already_requested: 409,
  already_decided: 409,
  ticket_not_found: 404,
  ticket_wrong_trip: 409,
  ticket_used: 409,
  ticket_not_paid: 409,
  currency_mismatch: 422,
  payments_unavailable: 503,
  billing_read_only: 402,
  quote_expired: 409,
  contract_locked: 409,
  escrow_disabled: 403,
  escrow_disputed: 409,
  nothing_to_release: 409,
  already_released: 409,
  tender_not_reviewed: 409,
  tender_blocked: 409,
  tender_no_text: 400,
  rate_below_minimum: 400,
  request_already_open: 409,
  request_closed: 409,
  sole_owner: 409,
  reason_required: 400,
};

export class ServiceError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly fields?: Record<string, string>,
  ) {
    super(code);
    this.name = "ServiceError";
  }

  get status(): number {
    return STATUS[this.code] ?? 500;
  }
}

export const isErrorCode = (v: string): v is ErrorCode => (ERROR_CODES as readonly string[]).includes(v);

/** Turns a Postgres/PostgREST error into a ServiceError (RPCs raise our codes as messages). */
export function fromDbError(error: Pick<PostgrestError, "code" | "message">): ServiceError {
  if (isErrorCode(error.message)) return new ServiceError(error.message);
  if (error.code === "42501") return new ServiceError("forbidden");
  if (error.code === "PGRST116") return new ServiceError("not_found");
  return new ServiceError("unknown");
}
