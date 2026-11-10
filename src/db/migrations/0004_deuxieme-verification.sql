CREATE TABLE "two_factor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "two_factor" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "second_factor_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE POLICY "amap_role_auth_select" ON "amap_role" AS PERMISSIVE FOR SELECT TO "pomme_auth" USING (true);--> statement-breakpoint
CREATE POLICY "user_update_by_amap_admin" ON "user" AS PERMISSIVE FOR UPDATE TO public USING (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
        and exists (select 1 from amap_role where amap_role.user_id = "user"."id")
        and "user"."is_platform_admin" = false) WITH CHECK (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
        and exists (select 1 from amap_role where amap_role.user_id = "user"."id")
        and "user"."is_platform_admin" = false);--> statement-breakpoint
CREATE POLICY "two_factor_auth" ON "two_factor" AS PERMISSIVE FOR ALL TO "pomme_auth" USING (true) WITH CHECK (true);