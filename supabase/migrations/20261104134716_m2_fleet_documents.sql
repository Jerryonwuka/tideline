CREATE TYPE "public"."alert_channel" AS ENUM('whatsapp', 'sms', 'email', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."crew_role" AS ENUM('captain', 'engineer', 'deckhand', 'ticket_agent', 'other');--> statement-breakpoint
CREATE TYPE "public"."crew_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('needs_review', 'valid', 'expiring', 'expired', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."vessel_status" AS ENUM('active', 'maintenance', 'idle', 'on_charter', 'laid_up');--> statement-breakpoint
CREATE TYPE "public"."vessel_type" AS ENUM('ferry', 'crew_boat', 'osv', 'tug', 'barge', 'speedboat', 'other');--> statement-breakpoint
CREATE TABLE "crew_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"full_name" text NOT NULL,
	"phone_e164" text,
	"crew_role" "crew_role" NOT NULL,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"status" "crew_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"offset_days" integer NOT NULL,
	"channel" "alert_channel" NOT NULL,
	"sent_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subject_type" "applies_to" NOT NULL,
	"subject_id" uuid NOT NULL,
	"document_type_code" text NOT NULL,
	"number" text,
	"issuer" text,
	"issue_date" date,
	"expiry_date" date,
	"file_path" text,
	"status" "document_status" DEFAULT 'needs_review' NOT NULL,
	"extracted" jsonb,
	"extraction_confidence" numeric(4, 3),
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"is_public" boolean DEFAULT false NOT NULL,
	"replaced_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vessel_crew" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vessel_id" uuid NOT NULL,
	"crew_member_id" uuid NOT NULL,
	"from_date" date DEFAULT current_date NOT NULL,
	"to_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vessels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "vessel_type" NOT NULL,
	"flag_country_code" char(2),
	"operating_country_code" char(2) NOT NULL,
	"registration_no" text,
	"imo" text,
	"mmsi" text,
	"year_built" smallint,
	"length_m" numeric(6, 2),
	"passenger_capacity" integer,
	"cargo_capacity_t" numeric(10, 2),
	"engine" text,
	"home_jetty_id" uuid,
	"status" "vessel_status" DEFAULT 'active' NOT NULL,
	"idle_since" timestamp with time zone,
	"ferry_enabled" boolean DEFAULT false NOT NULL,
	"charter_enabled" boolean DEFAULT false NOT NULL,
	"photos" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_alerts" ADD CONSTRAINT "document_alerts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_alerts" ADD CONSTRAINT "document_alerts_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_document_type_code_document_types_code_fk" FOREIGN KEY ("document_type_code") REFERENCES "public"."document_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessel_crew" ADD CONSTRAINT "vessel_crew_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessel_crew" ADD CONSTRAINT "vessel_crew_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessel_crew" ADD CONSTRAINT "vessel_crew_crew_member_id_crew_members_id_fk" FOREIGN KEY ("crew_member_id") REFERENCES "public"."crew_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessels" ADD CONSTRAINT "vessels_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessels" ADD CONSTRAINT "vessels_flag_country_code_countries_code_fk" FOREIGN KEY ("flag_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessels" ADD CONSTRAINT "vessels_operating_country_code_countries_code_fk" FOREIGN KEY ("operating_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crew_members_org_idx" ON "crew_members" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crew_members_org_user_key" ON "crew_members" USING btree ("org_id","user_id") WHERE user_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "document_alerts_once_key" ON "document_alerts" USING btree ("document_id","offset_days","channel");--> statement-breakpoint
CREATE INDEX "documents_subject_idx" ON "documents" USING btree ("org_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "documents_expiry_idx" ON "documents" USING btree ("org_id","expiry_date");--> statement-breakpoint
CREATE INDEX "vessel_crew_vessel_idx" ON "vessel_crew" USING btree ("vessel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vessel_crew_open_key" ON "vessel_crew" USING btree ("vessel_id","crew_member_id") WHERE to_date is null;--> statement-breakpoint
CREATE INDEX "vessels_org_idx" ON "vessels" USING btree ("org_id");