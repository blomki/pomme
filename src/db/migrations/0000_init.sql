CREATE TYPE "public"."amap_role_name" AS ENUM('admin', 'referent');--> statement-breakpoint
CREATE TABLE "amap" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contact_email" text,
	"distribution_place" text,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amap_slug_unique" UNIQUE("slug"),
	CONSTRAINT "amap_slug_format" CHECK ("amap"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("amap"."slug") between 3 and 40)
);
--> statement-breakpoint
ALTER TABLE "amap" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "amap_role" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "amap_role_name" NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amap_role_unique" UNIQUE("amap_id","user_id","role")
);
--> statement-breakpoint
ALTER TABLE "amap_role" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"email_verified_at" timestamp with time zone,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_email_lowercase" CHECK ("user"."email" = lower("user"."email")),
	CONSTRAINT "user_phone_international" CHECK ("user"."phone" ~ '^\+[1-9][0-9]{6,14}$')
);
--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "amap" ADD CONSTRAINT "amap_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amap_role" ADD CONSTRAINT "amap_role_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amap_role" ADD CONSTRAINT "amap_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amap_role" ADD CONSTRAINT "amap_role_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amap_role_user_idx" ON "amap_role" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("amap_id","entity_type","entity_id");--> statement-breakpoint
CREATE POLICY "amap_select" ON "amap" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "amap_update" ON "amap" AS PERMISSIVE FOR UPDATE TO public USING ("amap"."id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("amap"."id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "amap_role_isolation" ON "amap_role" AS PERMISSIVE FOR ALL TO public USING ("amap_role"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("amap_role"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "audit_log_select" ON "audit_log" AS PERMISSIVE FOR SELECT TO public USING ("audit_log"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "audit_log_insert" ON "audit_log" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("audit_log"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid
        and "audit_log"."actor_user_id" is not distinct from nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "user_select" ON "user" AS PERMISSIVE FOR SELECT TO public USING ("user"."id" = nullif(current_setting('app.user_id', true), '')::uuid
        or exists (select 1 from amap_role where amap_role.user_id = "user"."id"));--> statement-breakpoint
CREATE POLICY "user_insert" ON "user" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("user"."is_platform_admin" = false);--> statement-breakpoint
CREATE POLICY "user_update" ON "user" AS PERMISSIVE FOR UPDATE TO public USING ("user"."id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("user"."id" = nullif(current_setting('app.user_id', true), '')::uuid and "user"."is_platform_admin" = false);