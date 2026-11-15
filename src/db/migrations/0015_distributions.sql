CREATE TABLE "distribution" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"closed_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "distribution_amap_date_unique" UNIQUE("amap_id","date"),
	CONSTRAINT "distribution_times" CHECK ("distribution"."start_time" < "distribution"."end_time"),
	CONSTRAINT "distribution_closed_reason" CHECK (("distribution"."is_open" and "distribution"."closed_reason" is null)
        or (not "distribution"."is_open" and coalesce(length(trim("distribution"."closed_reason")), 0) > 0))
);
--> statement-breakpoint
ALTER TABLE "distribution" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "distribution" ADD CONSTRAINT "distribution_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution" ADD CONSTRAINT "distribution_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "distribution_isolation" ON "distribution" AS PERMISSIVE FOR ALL TO public USING ("distribution"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("distribution"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);