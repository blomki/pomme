CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed', 'rate_limited');--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid,
	"user_id" uuid,
	"template" text NOT NULL,
	"dedupe_key" text,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"provider_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_log_dedupe_idx" ON "notification_log" USING btree ("amap_id","dedupe_key") WHERE "notification_log"."dedupe_key" is not null and "notification_log"."status" in ('pending', 'sent');--> statement-breakpoint
CREATE INDEX "notification_log_user_idx" ON "notification_log" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "notification_log_select" ON "notification_log" AS PERMISSIVE FOR SELECT TO public USING ("notification_log"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "notification_log_insert" ON "notification_log" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("notification_log"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "notification_log_update" ON "notification_log" AS PERMISSIVE FOR UPDATE TO public USING ("notification_log"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("notification_log"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "notification_log_platform_auth" ON "notification_log" AS PERMISSIVE FOR ALL TO "pomme_auth" USING ("notification_log"."amap_id" is null) WITH CHECK ("notification_log"."amap_id" is null);