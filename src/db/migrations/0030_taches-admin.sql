CREATE TYPE "public"."admin_task_kind" AS ENUM('distribution_closed', 'report_follow_up');--> statement-breakpoint
CREATE TABLE "admin_task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"kind" "admin_task_kind" NOT NULL,
	"related_id" uuid NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"due_date" date,
	"done_at" timestamp with time zone,
	"done_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_task_subject_unique" UNIQUE("amap_id","kind","related_id"),
	CONSTRAINT "admin_task_done" CHECK (("admin_task"."done_at" is null) = ("admin_task"."done_by" is null))
);
--> statement-breakpoint
ALTER TABLE "admin_task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_task" ADD CONSTRAINT "admin_task_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_task" ADD CONSTRAINT "admin_task_done_by_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "admin_task_select" ON "admin_task" AS PERMISSIVE FOR SELECT TO public USING ("admin_task"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "admin_task_insert" ON "admin_task" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("admin_task"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "admin_task_update" ON "admin_task" AS PERMISSIVE FOR UPDATE TO public USING ("admin_task"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)) WITH CHECK ("admin_task"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));