CREATE TYPE "public"."sync_op_status" AS ENUM('applied', 'conflict', 'rejected');--> statement-breakpoint
CREATE TABLE "sync_ops" (
	"org_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"op" text NOT NULL,
	"status" "sync_op_status" NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_ops_org_id_client_id_pk" PRIMARY KEY("org_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "sync_ops" ADD CONSTRAINT "sync_ops_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_ops_user_idx" ON "sync_ops" USING btree ("user_id","processed_at");