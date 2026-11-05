CREATE TYPE "public"."override_decision" AS ENUM('approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."safety_result" AS ENUM('pass', 'warn', 'block');--> statement-breakpoint
CREATE TABLE "safety_acknowledgements" (
	"safety_check_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"acknowledged_by" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"checked_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"weather_snapshot" jsonb,
	"weather_fetched_at" timestamp with time zone,
	"sunrise" timestamp with time zone,
	"sunset" timestamp with time zone,
	"rules_applied" jsonb NOT NULL,
	"result" "safety_result" NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offline" boolean DEFAULT false NOT NULL,
	"client_id" text
);
--> statement-breakpoint
CREATE TABLE "safety_override_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"safety_check_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "safety_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"safety_check_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"decided_by" uuid NOT NULL,
	"decision" "override_decision" NOT NULL,
	"reason" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_thresholds" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"max_wind_kmh" numeric NOT NULL,
	"max_gust_kmh" numeric NOT NULL,
	"max_wave_m" numeric NOT NULL,
	"max_precip_mm_h" numeric NOT NULL,
	"night_block" boolean DEFAULT true NOT NULL,
	"permitted_start" time,
	"permitted_end" time,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weather_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "safety_rule_defaults" ADD COLUMN "max_precip_mm_h" numeric DEFAULT '10' NOT NULL;--> statement-breakpoint
ALTER TABLE "safety_acknowledgements" ADD CONSTRAINT "safety_acknowledgements_safety_check_id_safety_checks_id_fk" FOREIGN KEY ("safety_check_id") REFERENCES "public"."safety_checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_acknowledgements" ADD CONSTRAINT "safety_acknowledgements_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_checks" ADD CONSTRAINT "safety_checks_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_checks" ADD CONSTRAINT "safety_checks_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_override_requests" ADD CONSTRAINT "safety_override_requests_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_override_requests" ADD CONSTRAINT "safety_override_requests_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_override_requests" ADD CONSTRAINT "safety_override_requests_safety_check_id_safety_checks_id_fk" FOREIGN KEY ("safety_check_id") REFERENCES "public"."safety_checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_overrides" ADD CONSTRAINT "safety_overrides_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_overrides" ADD CONSTRAINT "safety_overrides_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_overrides" ADD CONSTRAINT "safety_overrides_safety_check_id_safety_checks_id_fk" FOREIGN KEY ("safety_check_id") REFERENCES "public"."safety_checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_overrides" ADD CONSTRAINT "safety_overrides_request_id_safety_override_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."safety_override_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_thresholds" ADD CONSTRAINT "safety_thresholds_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "safety_checks_org_client_key" ON "safety_checks" USING btree ("org_id","client_id");--> statement-breakpoint
CREATE INDEX "safety_checks_trip_idx" ON "safety_checks" USING btree ("trip_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "safety_override_requests_check_key" ON "safety_override_requests" USING btree ("safety_check_id");--> statement-breakpoint
CREATE UNIQUE INDEX "safety_overrides_request_key" ON "safety_overrides" USING btree ("request_id");