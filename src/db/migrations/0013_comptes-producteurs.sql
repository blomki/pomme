CREATE TABLE "producer_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"producer_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "producer_user_unique" UNIQUE("producer_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "producer_user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "producer_user" ADD CONSTRAINT "producer_user_producer_id_producer_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer_user" ADD CONSTRAINT "producer_user_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer_user" ADD CONSTRAINT "producer_user_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "producer_user_user_idx" ON "producer_user" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "producer_update_by_referent" ON "producer" AS PERMISSIVE FOR UPDATE TO public USING (exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "producer"."id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)) WITH CHECK (exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "producer"."id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
));--> statement-breakpoint
CREATE POLICY "producer_user_select" ON "producer_user" AS PERMISSIVE FOR SELECT TO public USING ("producer_user"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid
        or exists (select 1 from amap_producer where amap_producer.producer_id = "producer_user"."producer_id"));--> statement-breakpoint
CREATE POLICY "producer_user_insert" ON "producer_user" AS PERMISSIVE FOR INSERT TO public WITH CHECK (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
        and exists (select 1 from amap_producer where amap_producer.producer_id = "producer_user"."producer_id"));--> statement-breakpoint
ALTER POLICY "producer_select" ON "producer" TO public USING (exists (select 1 from amap_producer where amap_producer.producer_id = "producer"."id")
        or exists (select 1 from producer_user where producer_user.producer_id = "producer"."id"
          and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid));--> statement-breakpoint
ALTER POLICY "user_select" ON "user" TO public USING ("user"."id" = nullif(current_setting('app.user_id', true), '')::uuid or (
  exists (select 1 from amap_role where amap_role.user_id = "user"."id")
  or exists (select 1 from household_member where household_member.user_id = "user"."id")
  or exists (select 1 from producer_user where producer_user.user_id = "user"."id")
));--> statement-breakpoint
ALTER POLICY "user_update_by_amap_admin" ON "user" TO public USING (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) and (
  exists (select 1 from amap_role where amap_role.user_id = "user"."id")
  or exists (select 1 from household_member where household_member.user_id = "user"."id")
  or exists (select 1 from producer_user where producer_user.user_id = "user"."id")
)
        and "user"."is_platform_admin" = false) WITH CHECK (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) and (
  exists (select 1 from amap_role where amap_role.user_id = "user"."id")
  or exists (select 1 from household_member where household_member.user_id = "user"."id")
  or exists (select 1 from producer_user where producer_user.user_id = "user"."id")
)
        and "user"."is_platform_admin" = false);