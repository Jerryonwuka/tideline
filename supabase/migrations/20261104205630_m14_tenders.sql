CREATE TYPE "public"."tender_pack_status" AS ENUM('draft', 'reviewed', 'exported');--> statement-breakpoint
CREATE TYPE "public"."tender_status" AS ENUM('new', 'parsed', 'in_progress', 'exported');--> statement-breakpoint
CREATE TABLE "tender_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tender_id" uuid NOT NULL,
	"vessel_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"items" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "tender_pack_status" DEFAULT 'draft' NOT NULL,
	"submit_anyway" boolean DEFAULT false NOT NULL,
	"submit_anyway_by" uuid,
	"submit_anyway_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"export_path" text,
	"zip_path" text,
	"exported_by" uuid,
	"exported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tender_packs_tender_id_unique" UNIQUE("tender_id")
);
--> statement-breakpoint
CREATE TABLE "tenders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"client_name" text,
	"deadline" date,
	"requirements_text" text NOT NULL,
	"requirements_file_path" text,
	"parsed" jsonb,
	"status" "tender_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tender_packs" ADD CONSTRAINT "tender_packs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_packs" ADD CONSTRAINT "tender_packs_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;