CREATE TYPE "public"."duty_plan_status" AS ENUM('collecting', 'draft', 'sent');--> statement-breakpoint
CREATE TABLE "duty_plan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"quarter_start" date NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"unavailability_deadline" timestamp with time zone NOT NULL,
	"auto_reminder" boolean DEFAULT true NOT NULL,
	"status" "duty_plan_status" DEFAULT 'collecting' NOT NULL,
	"opening_notice_at" timestamp with time zone,
	"last_reminder_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duty_plan_quarter_unique" UNIQUE("amap_id","quarter_start"),
	CONSTRAINT "duty_plan_amap_unique" UNIQUE("id","amap_id"),
	CONSTRAINT "duty_plan_quarter_first_day" CHECK (extract(day from "duty_plan"."quarter_start") = 1 and extract(month from "duty_plan"."quarter_start") in (1, 4, 7, 10)),
	CONSTRAINT "duty_plan_dates" CHECK ("duty_plan"."opens_at" < "duty_plan"."unavailability_deadline")
);
--> statement-breakpoint
ALTER TABLE "duty_plan" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "duty_response" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"duty_plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"answered_at" timestamp with time zone,
	"last_reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duty_response_unique" UNIQUE("duty_plan_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "duty_response" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "unavailability" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"duty_plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"distribution_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unavailability_unique" UNIQUE("user_id","distribution_id")
);
--> statement-breakpoint
ALTER TABLE "unavailability" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "duty_plan" ADD CONSTRAINT "duty_plan_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_plan" ADD CONSTRAINT "duty_plan_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_response" ADD CONSTRAINT "duty_response_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_response" ADD CONSTRAINT "duty_response_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_response" ADD CONSTRAINT "duty_response_plan_fk" FOREIGN KEY ("duty_plan_id","amap_id") REFERENCES "public"."duty_plan"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_plan_fk" FOREIGN KEY ("duty_plan_id","amap_id") REFERENCES "public"."duty_plan"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_distribution_fk" FOREIGN KEY ("distribution_id","amap_id") REFERENCES "public"."distribution"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "duty_plan_select" ON "duty_plan" AS PERMISSIVE FOR SELECT TO public USING ("duty_plan"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and true);--> statement-breakpoint
CREATE POLICY "duty_plan_insert" ON "duty_plan" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("duty_plan"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "duty_plan_update" ON "duty_plan" AS PERMISSIVE FOR UPDATE TO public USING ("duty_plan"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or coalesce(current_setting('app.trusted', true), '') = 'closing_job')) WITH CHECK ("duty_plan"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or coalesce(current_setting('app.trusted', true), '') = 'closing_job'));--> statement-breakpoint
CREATE POLICY "duty_response_select" ON "duty_response" AS PERMISSIVE FOR SELECT TO public USING ("duty_response"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and ("duty_response"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or coalesce(current_setting('app.trusted', true), '') = 'closing_job'));--> statement-breakpoint
CREATE POLICY "duty_response_insert" ON "duty_response" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("duty_response"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and ("duty_response"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or coalesce(current_setting('app.trusted', true), '') = 'closing_job'));--> statement-breakpoint
CREATE POLICY "duty_response_update" ON "duty_response" AS PERMISSIVE FOR UPDATE TO public USING ("duty_response"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and ("duty_response"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or coalesce(current_setting('app.trusted', true), '') = 'closing_job')) WITH CHECK ("duty_response"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and ("duty_response"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or coalesce(current_setting('app.trusted', true), '') = 'closing_job'));--> statement-breakpoint
CREATE POLICY "unavailability_select" ON "unavailability" AS PERMISSIVE FOR SELECT TO public USING ("unavailability"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and ("unavailability"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)));--> statement-breakpoint
CREATE POLICY "unavailability_insert" ON "unavailability" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("unavailability"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and "unavailability"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "unavailability_delete" ON "unavailability" AS PERMISSIVE FOR DELETE TO public USING ("unavailability"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and "unavailability"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);