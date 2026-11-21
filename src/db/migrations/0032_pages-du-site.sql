CREATE TYPE "public"."page_children_order" AS ENUM('date_desc', 'manual');--> statement-breakpoint
CREATE TYPE "public"."page_role" AS ENUM('home', 'legal');--> statement-breakpoint
CREATE TYPE "public"."page_status" AS ENUM('draft', 'published', 'unpublished');--> statement-breakpoint
CREATE TABLE "page" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"parent_id" uuid,
	"role" "page_role",
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL,
	"image_url" text,
	"image_alt" text DEFAULT '' NOT NULL,
	"status" "page_status" DEFAULT 'draft' NOT NULL,
	"published_on" date,
	"in_menu" boolean DEFAULT false NOT NULL,
	"menu_position" integer DEFAULT 0 NOT NULL,
	"children_order" "page_children_order" DEFAULT 'date_desc' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"og_title" text DEFAULT '' NOT NULL,
	"og_description" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_amap_unique" UNIQUE("id","amap_id"),
	CONSTRAINT "page_slug_unique" UNIQUE NULLS NOT DISTINCT("amap_id","parent_id","slug"),
	CONSTRAINT "page_role_top_level" CHECK ("page"."role" is null or "page"."parent_id" is null),
	CONSTRAINT "page_not_own_parent" CHECK ("page"."parent_id" is null or "page"."parent_id" <> "page"."id"),
	CONSTRAINT "page_published_date" CHECK ("page"."status" <> 'published' or "page"."published_on" is not null)
);
--> statement-breakpoint
ALTER TABLE "page" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "page_redirect" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"from_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_redirect_path_unique" UNIQUE("amap_id","from_path")
);
--> statement-breakpoint
ALTER TABLE "page_redirect" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "page" ADD CONSTRAINT "page_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page" ADD CONSTRAINT "page_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page" ADD CONSTRAINT "page_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page" ADD CONSTRAINT "page_parent_fk" FOREIGN KEY ("parent_id","amap_id") REFERENCES "public"."page"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_redirect" ADD CONSTRAINT "page_redirect_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_redirect" ADD CONSTRAINT "page_redirect_page_fk" FOREIGN KEY ("page_id","amap_id") REFERENCES "public"."page"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_role_unique" ON "page" USING btree ("amap_id","role") WHERE "page"."role" is not null;--> statement-breakpoint
CREATE INDEX "page_parent_idx" ON "page" USING btree ("parent_id");--> statement-breakpoint
CREATE POLICY "page_select" ON "page" AS PERMISSIVE FOR SELECT TO public USING ("page"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and ("page"."status" = 'published' or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)));--> statement-breakpoint
CREATE POLICY "page_insert" ON "page" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("page"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "page_update" ON "page" AS PERMISSIVE FOR UPDATE TO public USING ("page"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)) WITH CHECK ("page"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "page_redirect_select" ON "page_redirect" AS PERMISSIVE FOR SELECT TO public USING ("page_redirect"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and true);--> statement-breakpoint
CREATE POLICY "page_redirect_insert" ON "page_redirect" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("page_redirect"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "page_redirect_update" ON "page_redirect" AS PERMISSIVE FOR UPDATE TO public USING ("page_redirect"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)) WITH CHECK ("page_redirect"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "page_redirect_delete" ON "page_redirect" AS PERMISSIVE FOR DELETE TO public USING ("page_redirect"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));