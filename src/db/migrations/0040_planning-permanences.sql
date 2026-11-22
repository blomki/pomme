CREATE TABLE "duty_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duty_history_unique" UNIQUE("amap_id","user_id"),
	CONSTRAINT "duty_history_count" CHECK ("duty_history"."imported_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "duty_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "duty_slot" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"duty_plan_id" uuid NOT NULL,
	"distribution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duty_slot_person_unique" UNIQUE("distribution_id","user_id"),
	CONSTRAINT "duty_slot_position_unique" UNIQUE("distribution_id","position"),
	CONSTRAINT "duty_slot_position" CHECK ("duty_slot"."position" >= 1)
);
--> statement-breakpoint
ALTER TABLE "duty_slot" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "duty_plan" ADD COLUMN "pending_notice" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "duty_history" ADD CONSTRAINT "duty_history_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_history" ADD CONSTRAINT "duty_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_slot" ADD CONSTRAINT "duty_slot_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_slot" ADD CONSTRAINT "duty_slot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_slot" ADD CONSTRAINT "duty_slot_plan_fk" FOREIGN KEY ("duty_plan_id","amap_id") REFERENCES "public"."duty_plan"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_slot" ADD CONSTRAINT "duty_slot_distribution_fk" FOREIGN KEY ("distribution_id","amap_id") REFERENCES "public"."distribution"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "duty_history_select" ON "duty_history" AS PERMISSIVE FOR SELECT TO public USING ("duty_history"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and ("duty_history"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)));--> statement-breakpoint
CREATE POLICY "duty_history_insert" ON "duty_history" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("duty_history"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "duty_history_update" ON "duty_history" AS PERMISSIVE FOR UPDATE TO public USING ("duty_history"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)) WITH CHECK ("duty_history"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "duty_slot_select" ON "duty_slot" AS PERMISSIVE FOR SELECT TO public USING ("duty_slot"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and true);--> statement-breakpoint
CREATE POLICY "duty_slot_insert" ON "duty_slot" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("duty_slot"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "duty_slot_update" ON "duty_slot" AS PERMISSIVE FOR UPDATE TO public USING ("duty_slot"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)) WITH CHECK ("duty_slot"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "duty_slot_delete" ON "duty_slot" AS PERMISSIVE FOR DELETE TO public USING ("duty_slot"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));