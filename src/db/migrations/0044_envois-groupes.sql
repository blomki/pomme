CREATE TYPE "public"."email_campaign_audience" AS ENUM('all_members', 'producer_customers', 'households_without_order', 'duty_all', 'duty_no_answer', 'duty_volunteers', 'duty_changes');--> statement-breakpoint
CREATE TABLE "email_campaign" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"audience" "email_campaign_audience" NOT NULL,
	"producer_id" uuid,
	"subject" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"sent_by" uuid,
	"automatic" boolean DEFAULT false NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"household_count" integer,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_campaign" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_log" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "email_campaign" ADD CONSTRAINT "email_campaign_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaign" ADD CONSTRAINT "email_campaign_producer_id_producer_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaign" ADD CONSTRAINT "email_campaign_sent_by_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_campaign_amap_idx" ON "email_campaign" USING btree ("amap_id","sent_at");--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_campaign_id_email_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "email_campaign_select" ON "email_campaign" AS PERMISSIVE FOR SELECT TO public USING ("email_campaign"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "email_campaign_insert" ON "email_campaign" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("email_campaign"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or coalesce(current_setting('app.trusted', true), '') = 'closing_job'));--> statement-breakpoint
CREATE POLICY "email_campaign_update" ON "email_campaign" AS PERMISSIVE FOR UPDATE TO public USING ("email_campaign"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or coalesce(current_setting('app.trusted', true), '') = 'closing_job')) WITH CHECK ("email_campaign"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or coalesce(current_setting('app.trusted', true), '') = 'closing_job'));