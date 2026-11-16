CREATE TYPE "public"."catalog_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "catalog" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"producer_id" uuid NOT NULL,
	"month" date NOT NULL,
	"status" "catalog_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_unique" UNIQUE("amap_id","producer_id","month"),
	CONSTRAINT "catalog_amap_unique" UNIQUE("id","amap_id"),
	CONSTRAINT "catalog_month_first_day" CHECK (extract(day from "catalog"."month") = 1)
);
--> statement-breakpoint
ALTER TABLE "catalog" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"catalog_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"min_quantity" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_item_unique" UNIQUE("catalog_id","product_id"),
	CONSTRAINT "catalog_item_amap_unique" UNIQUE("id","amap_id"),
	CONSTRAINT "catalog_item_price_positive" CHECK ("catalog_item"."price_cents" > 0),
	CONSTRAINT "catalog_item_min_quantity" CHECK ("catalog_item"."min_quantity" is null or "catalog_item"."min_quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "catalog_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog_item_availability" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"distribution_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_item_availability_unique" UNIQUE("catalog_item_id","distribution_id")
);
--> statement-breakpoint
ALTER TABLE "catalog_item_availability" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY NOT NULL,
	"producer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"photo_url" text,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_name_not_blank" CHECK (length(trim("product"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "product" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "catalog" ADD CONSTRAINT "catalog_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog" ADD CONSTRAINT "catalog_producer_id_producer_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog" ADD CONSTRAINT "catalog_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_catalog_fk" FOREIGN KEY ("catalog_id","amap_id") REFERENCES "public"."catalog"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_availability" ADD CONSTRAINT "catalog_item_availability_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_availability" ADD CONSTRAINT "catalog_item_availability_item_fk" FOREIGN KEY ("catalog_item_id","amap_id") REFERENCES "public"."catalog_item"("id","amap_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_availability" ADD CONSTRAINT "catalog_item_availability_distribution_fk" FOREIGN KEY ("distribution_id","amap_id") REFERENCES "public"."distribution"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_producer_id_producer_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_producer_idx" ON "product" USING btree ("producer_id");--> statement-breakpoint
CREATE POLICY "catalog_select" ON "catalog" AS PERMISSIVE FOR SELECT TO public USING ("catalog"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "catalog_insert" ON "catalog" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("catalog"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "catalog"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
) or exists (
  select 1 from producer_user
  where producer_user.producer_id = "catalog"."producer_id" and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)));--> statement-breakpoint
CREATE POLICY "catalog_update" ON "catalog" AS PERMISSIVE FOR UPDATE TO public USING ("catalog"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "catalog"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
) or exists (
  select 1 from producer_user
  where producer_user.producer_id = "catalog"."producer_id" and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
))) WITH CHECK ("catalog"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "catalog"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
) or exists (
  select 1 from producer_user
  where producer_user.producer_id = "catalog"."producer_id" and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)));--> statement-breakpoint
CREATE POLICY "catalog_item_select" ON "catalog_item" AS PERMISSIVE FOR SELECT TO public USING ("catalog_item"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "catalog_item_insert" ON "catalog_item" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("catalog_item"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from catalog where catalog.id = "catalog_item"."catalog_id" and (exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
) or exists (
  select 1 from producer_user
  where producer_user.producer_id = catalog.producer_id and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
))
));--> statement-breakpoint
CREATE POLICY "catalog_item_update" ON "catalog_item" AS PERMISSIVE FOR UPDATE TO public USING ("catalog_item"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from catalog where catalog.id = "catalog_item"."catalog_id" and (exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
) or exists (
  select 1 from producer_user
  where producer_user.producer_id = catalog.producer_id and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
))
)) WITH CHECK ("catalog_item"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from catalog where catalog.id = "catalog_item"."catalog_id" and (exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
) or exists (
  select 1 from producer_user
  where producer_user.producer_id = catalog.producer_id and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
))
));--> statement-breakpoint
CREATE POLICY "catalog_item_availability_select" ON "catalog_item_availability" AS PERMISSIVE FOR SELECT TO public USING ("catalog_item_availability"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "catalog_item_availability_insert" ON "catalog_item_availability" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("catalog_item_availability"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
        select 1 from catalog_item where catalog_item.id = "catalog_item_availability"."catalog_item_id"
          and exists (
  select 1 from catalog where catalog.id = catalog_item.catalog_id and (exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
) or exists (
  select 1 from producer_user
  where producer_user.producer_id = catalog.producer_id and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
))
)));--> statement-breakpoint
CREATE POLICY "catalog_item_availability_delete" ON "catalog_item_availability" AS PERMISSIVE FOR DELETE TO public USING ("catalog_item_availability"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
        select 1 from catalog_item where catalog_item.id = "catalog_item_availability"."catalog_item_id"
          and exists (
  select 1 from catalog where catalog.id = catalog_item.catalog_id and (exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
) or exists (
  select 1 from producer_user
  where producer_user.producer_id = catalog.producer_id and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
))
)));--> statement-breakpoint
CREATE POLICY "product_select" ON "product" AS PERMISSIVE FOR SELECT TO public USING (exists (select 1 from amap_producer where amap_producer.producer_id = "product"."producer_id")
        or exists (
  select 1 from producer_user
  where producer_user.producer_id = "product"."producer_id" and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
));--> statement-breakpoint
CREATE POLICY "product_insert" ON "product" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "product"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
) or exists (
  select 1 from producer_user
  where producer_user.producer_id = "product"."producer_id" and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)));--> statement-breakpoint
CREATE POLICY "product_update" ON "product" AS PERMISSIVE FOR UPDATE TO public USING ((exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "product"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
) or exists (
  select 1 from producer_user
  where producer_user.producer_id = "product"."producer_id" and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
))) WITH CHECK ((exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "product"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
) or exists (
  select 1 from producer_user
  where producer_user.producer_id = "product"."producer_id" and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)));