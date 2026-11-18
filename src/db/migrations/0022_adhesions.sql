CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"fee_cents" integer,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_dates" CHECK ("membership"."end_date" > "membership"."start_date"),
	CONSTRAINT "membership_fee" CHECK ("membership"."fee_cents" is null or "membership"."fee_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_household_fk" FOREIGN KEY ("household_id","amap_id") REFERENCES "public"."household"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_household_idx" ON "membership" USING btree ("household_id");--> statement-breakpoint
CREATE POLICY "membership_select" ON "membership" AS PERMISSIVE FOR SELECT TO public USING ("membership"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "membership_insert" ON "membership" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("membership"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "membership_update" ON "membership" AS PERMISSIVE FOR UPDATE TO public USING ("membership"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("membership"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);