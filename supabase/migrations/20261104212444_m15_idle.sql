CREATE TYPE "public"."suggestion_review" AS ENUM('needs_review', 'accepted');--> statement-breakpoint
CREATE TABLE "board_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charterer_org_id" uuid NOT NULL,
	"vessel_type" text,
	"area" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vessel_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vessel_id" uuid NOT NULL,
	"idle_since" timestamp with time zone NOT NULL,
	"currency" char(3) NOT NULL,
	"suggested_rate_minor" bigint,
	"inputs" jsonb NOT NULL,
	"rationale" text,
	"listing_description" text,
	"review_status" "suggestion_review" DEFAULT 'needs_review' NOT NULL,
	"buyers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_listing_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_searches" ADD CONSTRAINT "board_searches_charterer_org_id_orgs_id_fk" FOREIGN KEY ("charterer_org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessel_suggestions" ADD CONSTRAINT "vessel_suggestions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessel_suggestions" ADD CONSTRAINT "vessel_suggestions_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessel_suggestions" ADD CONSTRAINT "vessel_suggestions_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessel_suggestions" ADD CONSTRAINT "vessel_suggestions_published_listing_id_charter_listings_id_fk" FOREIGN KEY ("published_listing_id") REFERENCES "public"."charter_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_searches_created_idx" ON "board_searches" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vessel_suggestions_vessel_idx" ON "vessel_suggestions" USING btree ("vessel_id");--> statement-breakpoint
CREATE INDEX "vessel_suggestions_org_idx" ON "vessel_suggestions" USING btree ("org_id");