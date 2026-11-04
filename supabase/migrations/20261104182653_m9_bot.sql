CREATE TYPE "public"."incident_status" AS ENUM('open', 'acknowledged', 'closed');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('whatsapp', 'sms');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."message_state" AS ENUM('received', 'awaiting_confirm', 'confirmed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."record_source" AS ENUM('app', 'whatsapp_voice', 'whatsapp_text', 'sms');--> statement-breakpoint
CREATE TABLE "bot_sessions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" "message_channel" NOT NULL,
	"message_id" uuid NOT NULL,
	"draft" jsonb NOT NULL,
	"asking" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vessel_id" uuid,
	"trip_id" uuid,
	"category" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"payment_method" text,
	"note" text,
	"source" "record_source" NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"trip_id" uuid,
	"vessel_id" uuid,
	"reported_by" uuid,
	"source" "record_source" NOT NULL,
	"description" text NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"escalated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" uuid,
	"direction" "message_direction" NOT NULL,
	"channel" "message_channel" DEFAULT 'whatsapp' NOT NULL,
	"phone_hash" text NOT NULL,
	"wa_message_id" text NOT NULL,
	"type" text NOT NULL,
	"media_path" text,
	"transcript" text,
	"parsed" jsonb,
	"state" "message_state" DEFAULT 'received' NOT NULL,
	"linked_entity_type" text,
	"linked_entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_message_id_wa_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."wa_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_org_idx" ON "expenses" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "incidents_org_idx" ON "incidents" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_messages_provider_id_key" ON "wa_messages" USING btree ("channel","wa_message_id");--> statement-breakpoint
CREATE INDEX "wa_messages_org_idx" ON "wa_messages" USING btree ("org_id","created_at");