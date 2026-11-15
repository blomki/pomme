CREATE TABLE "amap_producer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"producer_id" uuid NOT NULL,
	"check_payee" text DEFAULT '' NOT NULL,
	"distance_km" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amap_producer_unique" UNIQUE("amap_id","producer_id"),
	CONSTRAINT "amap_producer_amap_unique" UNIQUE("id","amap_id"),
	CONSTRAINT "amap_producer_distance" CHECK ("amap_producer"."distance_km" is null or "amap_producer"."distance_km" between 0 and 1000)
);
--> statement-breakpoint
ALTER TABLE "amap_producer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "producer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"short_description" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"phone" text,
	"email" text,
	"photo_url" text,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "producer_name_not_blank" CHECK (length(trim("producer"."name")) > 0),
	CONSTRAINT "producer_phone_international" CHECK ("producer"."phone" ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "producer_email_lowercase" CHECK ("producer"."email" = lower("producer"."email"))
);
--> statement-breakpoint
ALTER TABLE "producer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "referent_assignment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"amap_producer_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referent_assignment_unique" UNIQUE("amap_producer_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "referent_assignment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "amap_producer" ADD CONSTRAINT "amap_producer_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amap_producer" ADD CONSTRAINT "amap_producer_producer_id_producer_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amap_producer" ADD CONSTRAINT "amap_producer_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer" ADD CONSTRAINT "producer_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referent_assignment" ADD CONSTRAINT "referent_assignment_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referent_assignment" ADD CONSTRAINT "referent_assignment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referent_assignment" ADD CONSTRAINT "referent_assignment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referent_assignment" ADD CONSTRAINT "referent_assignment_amap_producer_fk" FOREIGN KEY ("amap_producer_id","amap_id") REFERENCES "public"."amap_producer"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amap_producer_producer_idx" ON "amap_producer" USING btree ("producer_id");--> statement-breakpoint
CREATE INDEX "referent_assignment_user_idx" ON "referent_assignment" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "amap_producer_isolation" ON "amap_producer" AS PERMISSIVE FOR ALL TO public USING ("amap_producer"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("amap_producer"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "producer_select" ON "producer" AS PERMISSIVE FOR SELECT TO public USING (exists (select 1 from amap_producer where amap_producer.producer_id = "producer"."id"));--> statement-breakpoint
CREATE POLICY "producer_insert" ON "producer" AS PERMISSIVE FOR INSERT TO public WITH CHECK (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "producer_update" ON "producer" AS PERMISSIVE FOR UPDATE TO public USING (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
        and exists (select 1 from amap_producer where amap_producer.producer_id = "producer"."id")) WITH CHECK (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
        and exists (select 1 from amap_producer where amap_producer.producer_id = "producer"."id"));--> statement-breakpoint
CREATE POLICY "referent_assignment_isolation" ON "referent_assignment" AS PERMISSIVE FOR ALL TO public USING ("referent_assignment"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("referent_assignment"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);