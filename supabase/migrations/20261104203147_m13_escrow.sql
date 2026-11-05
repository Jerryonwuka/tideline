CREATE TYPE "public"."escrow_status" AS ENUM('held', 'partially_released', 'released', 'refunded', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'success', 'failed', 'reversed');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"country_code" char(2) NOT NULL,
	"currency" char(3) NOT NULL,
	"provider" text NOT NULL,
	"bank_code" text NOT NULL,
	"account_number_last4" char(4) NOT NULL,
	"account_name" text NOT NULL,
	"provider_recipient_code" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payee_org_id" uuid NOT NULL,
	"payer_org_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"charter_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"released_minor" bigint DEFAULT 0 NOT NULL,
	"refunded_minor" bigint DEFAULT 0 NOT NULL,
	"status" "escrow_status" DEFAULT 'held' NOT NULL,
	"release_rule" jsonb DEFAULT '{"mobilisation":"on_hire","hire":"off_hire"}'::jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dispute_reason" text,
	"disputed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escrow_holds_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "escrow_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hold_id" uuid NOT NULL,
	"tranche" text NOT NULL,
	"gross_minor" bigint NOT NULL,
	"commission_minor" bigint NOT NULL,
	"payout_minor" bigint NOT NULL,
	"refund_minor" bigint DEFAULT 0 NOT NULL,
	"released_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"bank_account_id" uuid,
	"escrow_hold_id" uuid,
	"release_id" uuid,
	"currency" char(3) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"commission_minor" bigint DEFAULT 0 NOT NULL,
	"provider_transfer_ref" text NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"initiated_by" uuid,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_release_id_unique" UNIQUE("release_id"),
	CONSTRAINT "payouts_provider_transfer_ref_unique" UNIQUE("provider_transfer_ref")
);
--> statement-breakpoint
ALTER TABLE "charters" ADD COLUMN "on_hire_owner_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "charters" ADD COLUMN "on_hire_charterer_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "charters" ADD COLUMN "off_hire_owner_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "charters" ADD COLUMN "off_hire_charterer_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_payee_org_id_orgs_id_fk" FOREIGN KEY ("payee_org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_payer_org_id_orgs_id_fk" FOREIGN KEY ("payer_org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_charter_id_charters_id_fk" FOREIGN KEY ("charter_id") REFERENCES "public"."charters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_releases" ADD CONSTRAINT "escrow_releases_hold_id_escrow_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."escrow_holds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_escrow_hold_id_escrow_holds_id_fk" FOREIGN KEY ("escrow_hold_id") REFERENCES "public"."escrow_holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_release_id_escrow_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."escrow_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "escrow_holds_charter_idx" ON "escrow_holds" USING btree ("charter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_releases_tranche_key" ON "escrow_releases" USING btree ("hold_id","tranche");