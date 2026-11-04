CREATE TYPE "public"."ai_job_kind" AS ENUM('ocr_extract', 'voice_log', 'tender_parse', 'tender_draft', 'price_rationale', 'weather_explain', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."ai_job_status" AS ENUM('queued', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "ai_job_kind" NOT NULL,
	"input_ref" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text,
	"output" jsonb,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_estimate_minor" bigint,
	"latency_ms" integer,
	"status" "ai_job_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text DEFAULT 'in_app' NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"status" text DEFAULT 'sent' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_jobs_org_created_idx" ON "ai_jobs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_jobs_input_idx" ON "ai_jobs" USING btree ("input_ref");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","sent_at");