CREATE TYPE "public"."cheque_status" AS ENUM('expected', 'received', 'handed_over');--> statement-breakpoint
CREATE TYPE "public"."credit_status" AS ENUM('created', 'deducted');--> statement-breakpoint
CREATE TYPE "public"."order_period_status" AS ENUM('scheduled', 'open', 'closed');--> statement-breakpoint
CREATE TABLE "cheque" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"producer_id" uuid NOT NULL,
	"order_period_id" uuid NOT NULL,
	"gross_cents" integer NOT NULL,
	"credits_cents" integer DEFAULT 0 NOT NULL,
	"expected_cents" integer NOT NULL,
	"status" "cheque_status" DEFAULT 'expected' NOT NULL,
	"received_cents" integer,
	"received_at" timestamp with time zone,
	"received_by" uuid,
	"handed_over_at" timestamp with time zone,
	"handed_over_by" uuid,
	"cheque_number" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cheque_unique" UNIQUE("household_id","producer_id","order_period_id"),
	CONSTRAINT "cheque_amap_unique" UNIQUE("id","amap_id"),
	CONSTRAINT "cheque_amounts" CHECK ("cheque"."gross_cents" >= 0 and "cheque"."credits_cents" >= 0
        and "cheque"."expected_cents" = "cheque"."gross_cents" - "cheque"."credits_cents" and "cheque"."expected_cents" >= 0),
	CONSTRAINT "cheque_received_cents" CHECK ("cheque"."received_cents" is null or "cheque"."received_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cheque" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"producer_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "credit_status" DEFAULT 'created' NOT NULL,
	"deducted_on_cheque_id" uuid,
	"split_from_credit_id" uuid,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_amount_positive" CHECK ("credit"."amount_cents" > 0),
	CONSTRAINT "credit_deducted_on_cheque" CHECK (("credit"."status" = 'deducted') = ("credit"."deducted_on_cheque_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "credit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"catalog_id" uuid NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_household_catalog_unique" UNIQUE("household_id","catalog_id"),
	CONSTRAINT "order_amap_unique" UNIQUE("id","amap_id")
);
--> statement-breakpoint
ALTER TABLE "order" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"distribution_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_line_unique" UNIQUE("order_id","catalog_item_id","distribution_id"),
	CONSTRAINT "order_line_quantity" CHECK ("order_line"."quantity" >= 0),
	CONSTRAINT "order_line_price_positive" CHECK ("order_line"."unit_price_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "order_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_period" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"month" date NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"status" "order_period_status" DEFAULT 'scheduled' NOT NULL,
	"closed_at" timestamp with time zone,
	"reopened_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_period_month_unique" UNIQUE("amap_id","month"),
	CONSTRAINT "order_period_amap_unique" UNIQUE("id","amap_id"),
	CONSTRAINT "order_period_month_first_day" CHECK (extract(day from "order_period"."month") = 1),
	CONSTRAINT "order_period_dates" CHECK ("order_period"."opens_at" < "order_period"."closes_at")
);
--> statement-breakpoint
ALTER TABLE "order_period" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cheque" ADD CONSTRAINT "cheque_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheque" ADD CONSTRAINT "cheque_producer_id_producer_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheque" ADD CONSTRAINT "cheque_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheque" ADD CONSTRAINT "cheque_handed_over_by_user_id_fk" FOREIGN KEY ("handed_over_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheque" ADD CONSTRAINT "cheque_household_fk" FOREIGN KEY ("household_id","amap_id") REFERENCES "public"."household"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheque" ADD CONSTRAINT "cheque_order_period_fk" FOREIGN KEY ("order_period_id","amap_id") REFERENCES "public"."order_period"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_producer_id_producer_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_household_fk" FOREIGN KEY ("household_id","amap_id") REFERENCES "public"."household"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_cheque_fk" FOREIGN KEY ("deducted_on_cheque_id","amap_id") REFERENCES "public"."cheque"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_split_from_fk" FOREIGN KEY ("split_from_credit_id") REFERENCES "public"."credit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_household_fk" FOREIGN KEY ("household_id","amap_id") REFERENCES "public"."household"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_catalog_fk" FOREIGN KEY ("catalog_id","amap_id") REFERENCES "public"."catalog"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_order_fk" FOREIGN KEY ("order_id","amap_id") REFERENCES "public"."order"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_catalog_item_fk" FOREIGN KEY ("catalog_item_id","amap_id") REFERENCES "public"."catalog_item"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_distribution_fk" FOREIGN KEY ("distribution_id","amap_id") REFERENCES "public"."distribution"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_period" ADD CONSTRAINT "order_period_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_period" ADD CONSTRAINT "order_period_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cheque_period_idx" ON "cheque" USING btree ("order_period_id");--> statement-breakpoint
CREATE INDEX "credit_pending_idx" ON "credit" USING btree ("household_id","producer_id") WHERE "credit"."status" = 'created';--> statement-breakpoint
CREATE INDEX "order_catalog_idx" ON "order" USING btree ("catalog_id");--> statement-breakpoint
CREATE POLICY "cheque_select" ON "cheque" AS PERMISSIVE FOR SELECT TO public USING ("cheque"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "cheque_insert" ON "cheque" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("cheque"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "cheque_update" ON "cheque" AS PERMISSIVE FOR UPDATE TO public USING ("cheque"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("cheque"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "credit_select" ON "credit" AS PERMISSIVE FOR SELECT TO public USING ("credit"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "credit_insert" ON "credit" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("credit"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "credit_update" ON "credit" AS PERMISSIVE FOR UPDATE TO public USING ("credit"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("credit"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "order_select" ON "order" AS PERMISSIVE FOR SELECT TO public USING ("order"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "order_insert" ON "order" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("order"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "order_update" ON "order" AS PERMISSIVE FOR UPDATE TO public USING ("order"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("order"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "order_line_select" ON "order_line" AS PERMISSIVE FOR SELECT TO public USING ("order_line"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "order_line_insert" ON "order_line" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("order_line"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "order_line_update" ON "order_line" AS PERMISSIVE FOR UPDATE TO public USING ("order_line"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("order_line"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "order_line_delete" ON "order_line" AS PERMISSIVE FOR DELETE TO public USING ("order_line"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "order_period_select" ON "order_period" AS PERMISSIVE FOR SELECT TO public USING ("order_period"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "order_period_insert" ON "order_period" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("order_period"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "order_period_update" ON "order_period" AS PERMISSIVE FOR UPDATE TO public USING ("order_period"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("order_period"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);