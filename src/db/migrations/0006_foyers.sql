CREATE TABLE "household" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_amap_unique" UNIQUE("id","amap_id"),
	CONSTRAINT "household_name_not_blank" CHECK (length(trim("household"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "household" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "household_member" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_member_unique" UNIQUE("household_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "household_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "household" ADD CONSTRAINT "household_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household" ADD CONSTRAINT "household_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_member" ADD CONSTRAINT "household_member_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_member" ADD CONSTRAINT "household_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_member" ADD CONSTRAINT "household_member_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_member" ADD CONSTRAINT "household_member_household_fk" FOREIGN KEY ("household_id","amap_id") REFERENCES "public"."household"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "household_name_unique" ON "household" USING btree ("amap_id",lower("name")) WHERE "household"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "household_member_one_household_idx" ON "household_member" USING btree ("amap_id","user_id") WHERE "household_member"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "household_member_one_primary_idx" ON "household_member" USING btree ("household_id") WHERE "household_member"."is_primary";--> statement-breakpoint
CREATE INDEX "household_member_user_idx" ON "household_member" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "household_isolation" ON "household" AS PERMISSIVE FOR ALL TO public USING ("household"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("household"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "household_member_isolation" ON "household_member" AS PERMISSIVE FOR ALL TO public USING ("household_member"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid) WITH CHECK ("household_member"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid);--> statement-breakpoint
ALTER POLICY "user_select" ON "user" TO public USING ("user"."id" = nullif(current_setting('app.user_id', true), '')::uuid or (
  exists (select 1 from amap_role where amap_role.user_id = "user"."id")
  or exists (select 1 from household_member where household_member.user_id = "user"."id")
));--> statement-breakpoint
ALTER POLICY "user_update_by_amap_admin" ON "user" TO public USING (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) and (
  exists (select 1 from amap_role where amap_role.user_id = "user"."id")
  or exists (select 1 from household_member where household_member.user_id = "user"."id")
)
        and "user"."is_platform_admin" = false) WITH CHECK (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) and (
  exists (select 1 from amap_role where amap_role.user_id = "user"."id")
  or exists (select 1 from household_member where household_member.user_id = "user"."id")
)
        and "user"."is_platform_admin" = false);