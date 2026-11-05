CREATE TYPE "public"."age_band" AS ENUM('child', 'adult', 'senior');--> statement-breakpoint
CREATE TYPE "public"."jetty_status" AS ENUM('proposed', 'active');--> statement-breakpoint
CREATE TYPE "public"."trip_source" AS ENUM('app', 'whatsapp_voice', 'whatsapp_text', 'sms', 'admin');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('scheduled', 'boarding', 'departed', 'arrived', 'cancelled');--> statement-breakpoint
CREATE TABLE "jetties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" char(2) NOT NULL,
	"time_zone" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"admin_area" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"status" "jetty_status" DEFAULT 'proposed' NOT NULL,
	"proposed_by_org_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manifest_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"full_name" text,
	"phone_e164" text,
	"age_band" "age_band",
	"sex" text,
	"next_of_kin_phone" text,
	"seats" integer DEFAULT 1 NOT NULL,
	"ticket_id" uuid,
	"boarded_at" timestamp with time zone,
	"is_amendment" boolean DEFAULT false NOT NULL,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"origin_jetty_id" uuid NOT NULL,
	"destination_jetty_id" uuid NOT NULL,
	"distance_km" numeric(7, 2),
	"duration_min" integer NOT NULL,
	"base_fare_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"vessel_id" uuid NOT NULL,
	"days_of_week" smallint[] NOT NULL,
	"departure_time" time NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vessel_id" uuid NOT NULL,
	"captain_crew_id" uuid,
	"route_id" uuid,
	"schedule_id" uuid,
	"origin_text" text,
	"destination_text" text,
	"scheduled_departure" timestamp with time zone,
	"actual_departure" timestamp with time zone,
	"actual_arrival" timestamp with time zone,
	"status" "trip_status" DEFAULT 'scheduled' NOT NULL,
	"passenger_count" integer DEFAULT 0 NOT NULL,
	"lifejackets_confirmed" boolean DEFAULT false NOT NULL,
	"cargo_note" text,
	"takings_cash_minor" bigint DEFAULT 0 NOT NULL,
	"takings_digital_minor" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) NOT NULL,
	"source" "trip_source" DEFAULT 'app' NOT NULL,
	"client_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "jetties" ADD CONSTRAINT "jetties_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jetties" ADD CONSTRAINT "jetties_proposed_by_org_id_orgs_id_fk" FOREIGN KEY ("proposed_by_org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manifest_entries" ADD CONSTRAINT "manifest_entries_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manifest_entries" ADD CONSTRAINT "manifest_entries_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_origin_jetty_id_jetties_id_fk" FOREIGN KEY ("origin_jetty_id") REFERENCES "public"."jetties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_destination_jetty_id_jetties_id_fk" FOREIGN KEY ("destination_jetty_id") REFERENCES "public"."jetties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_captain_crew_id_crew_members_id_fk" FOREIGN KEY ("captain_crew_id") REFERENCES "public"."crew_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jetties_country_idx" ON "jetties" USING btree ("country_code");--> statement-breakpoint
CREATE UNIQUE INDEX "manifest_org_client_key" ON "manifest_entries" USING btree ("org_id","client_id");--> statement-breakpoint
CREATE INDEX "manifest_trip_idx" ON "manifest_entries" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "routes_org_idx" ON "routes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "schedules_org_idx" ON "schedules" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_org_client_key" ON "trips" USING btree ("org_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_schedule_slot_key" ON "trips" USING btree ("schedule_id","scheduled_departure");--> statement-breakpoint
CREATE INDEX "trips_org_departure_idx" ON "trips" USING btree ("org_id","scheduled_departure");--> statement-breakpoint
CREATE INDEX "trips_vessel_idx" ON "trips" USING btree ("vessel_id");