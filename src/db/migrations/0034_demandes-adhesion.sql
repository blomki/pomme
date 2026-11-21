CREATE TYPE "public"."join_request_status" AS ENUM('new', 'contacted', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "join_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"message" text DEFAULT '' NOT NULL,
	"status" "join_request_status" DEFAULT 'new' NOT NULL,
	"household_id" uuid,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "join_request_accepted" CHECK (("join_request"."status" = 'accepted') = ("join_request"."household_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "join_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_handled_by_user_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_household_fk" FOREIGN KEY ("household_id","amap_id") REFERENCES "public"."household"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "join_request_status_idx" ON "join_request" USING btree ("amap_id","status");--> statement-breakpoint
CREATE POLICY "join_request_insert" ON "join_request" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("join_request"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and "join_request"."status" = 'new'
        and "join_request"."household_id" is null and "join_request"."handled_by" is null);--> statement-breakpoint
CREATE POLICY "join_request_select" ON "join_request" AS PERMISSIVE FOR SELECT TO public USING ("join_request"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "join_request_update" ON "join_request" AS PERMISSIVE FOR UPDATE TO public USING ("join_request"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)) WITH CHECK ("join_request"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));