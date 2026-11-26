CREATE TABLE "household_invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"email" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_invitation_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "household_invitation_email_lowercase" CHECK ("household_invitation"."email" = lower("household_invitation"."email"))
);
--> statement-breakpoint
ALTER TABLE "household_invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "passkey" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "preferred_space" text;--> statement-breakpoint
ALTER TABLE "household_invitation" ADD CONSTRAINT "household_invitation_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invitation" ADD CONSTRAINT "household_invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invitation" ADD CONSTRAINT "household_invitation_household_fk" FOREIGN KEY ("household_id","amap_id") REFERENCES "public"."household"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "household_invitation_household_idx" ON "household_invitation" USING btree ("household_id");--> statement-breakpoint
CREATE POLICY "household_invitation_select" ON "household_invitation" AS PERMISSIVE FOR SELECT TO public USING ("household_invitation"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and ("household_invitation"."household_id" in (select my_household_ids()) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)));--> statement-breakpoint
CREATE POLICY "household_invitation_insert" ON "household_invitation" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("household_invitation"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and ("household_invitation"."household_id" in (select my_household_ids())
        and "household_invitation"."invited_by" = nullif(current_setting('app.user_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "household_invitation_update" ON "household_invitation" AS PERMISSIVE FOR UPDATE TO public USING ("household_invitation"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and ("household_invitation"."household_id" in (select my_household_ids()) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
))) WITH CHECK ("household_invitation"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and ("household_invitation"."household_id" in (select my_household_ids()) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)));