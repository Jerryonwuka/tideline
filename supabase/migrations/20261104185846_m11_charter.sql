CREATE TYPE "public"."charter_status" AS ENUM('pending_contract', 'pending_payment', 'active', 'completed', 'disputed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'live', 'paused');--> statement-breakpoint
CREATE TYPE "public"."charter_quote_status" AS ENUM('sent', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."charter_request_status" AS ENUM('open', 'quoted', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TABLE "charter_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vessel_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"day_rate_minor" bigint NOT NULL,
	"min_rate_minor" bigint,
	"min_days" integer DEFAULT 1 NOT NULL,
	"operating_area" text NOT NULL,
	"available_from" date,
	"available_to" date,
	"description" text,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"suggested_rate_minor" bigint,
	"suggestion_inputs" jsonb,
	"public_document_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charter_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"vessel_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"day_rate_minor" bigint NOT NULL,
	"mobilisation_minor" bigint DEFAULT 0 NOT NULL,
	"terms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valid_until" date NOT NULL,
	"status" charter_quote_status DEFAULT 'sent' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charter_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charterer_org_id" uuid NOT NULL,
	"owner_org_id" uuid,
	"listing_id" uuid,
	"requested_by" uuid,
	"vessel_type" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"location" text NOT NULL,
	"country_code" char(2),
	"purpose" text NOT NULL,
	"crew_needs" text,
	"budget_minor" bigint,
	"currency" char(3),
	"status" charter_request_status DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"charterer_org_id" uuid,
	"vessel_id" uuid NOT NULL,
	"quote_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"on_hire_at" timestamp with time zone,
	"off_hire_at" timestamp with time zone,
	"currency" char(3) NOT NULL,
	"governing_country_code" char(2),
	"day_rate_minor" bigint NOT NULL,
	"mobilisation_minor" bigint DEFAULT 0 NOT NULL,
	"total_value_minor" bigint NOT NULL,
	"commission_bps" integer DEFAULT 0 NOT NULL,
	"booked_on_platform" boolean DEFAULT true NOT NULL,
	"status" charter_status DEFAULT 'pending_contract' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "crew_complement" smallint;--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "speed_kn" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "deck_space_m2" numeric(8, 1);--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "dp_class" text;--> statement-breakpoint
ALTER TABLE "charter_listings" ADD CONSTRAINT "charter_listings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_listings" ADD CONSTRAINT "charter_listings_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_listings" ADD CONSTRAINT "charter_listings_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_quotes" ADD CONSTRAINT "charter_quotes_owner_org_id_orgs_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_quotes" ADD CONSTRAINT "charter_quotes_request_id_charter_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."charter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_quotes" ADD CONSTRAINT "charter_quotes_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_quotes" ADD CONSTRAINT "charter_quotes_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_requests" ADD CONSTRAINT "charter_requests_charterer_org_id_orgs_id_fk" FOREIGN KEY ("charterer_org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_requests" ADD CONSTRAINT "charter_requests_owner_org_id_orgs_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_requests" ADD CONSTRAINT "charter_requests_listing_id_charter_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."charter_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_requests" ADD CONSTRAINT "charter_requests_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charter_requests" ADD CONSTRAINT "charter_requests_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charters" ADD CONSTRAINT "charters_owner_org_id_orgs_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charters" ADD CONSTRAINT "charters_charterer_org_id_orgs_id_fk" FOREIGN KEY ("charterer_org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charters" ADD CONSTRAINT "charters_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charters" ADD CONSTRAINT "charters_quote_id_charter_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."charter_quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charters" ADD CONSTRAINT "charters_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charters" ADD CONSTRAINT "charters_governing_country_code_countries_code_fk" FOREIGN KEY ("governing_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charter_listings_status_idx" ON "charter_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "charter_listings_org_idx" ON "charter_listings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "charter_quotes_request_idx" ON "charter_quotes" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "charter_requests_owner_idx" ON "charter_requests" USING btree ("owner_org_id");--> statement-breakpoint
CREATE INDEX "charter_requests_charterer_idx" ON "charter_requests" USING btree ("charterer_org_id");--> statement-breakpoint
CREATE INDEX "charters_owner_idx" ON "charters" USING btree ("owner_org_id");--> statement-breakpoint
CREATE INDEX "charters_charterer_idx" ON "charters" USING btree ("charterer_org_id");