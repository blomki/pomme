CREATE TABLE "platform_audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_audit_log_entity_idx" ON "platform_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE POLICY "platform_audit_log_select" ON "platform_audit_log" AS PERMISSIVE FOR SELECT TO public USING (exists (
  select 1 from "user" where "user"."id" = nullif(current_setting('app.user_id', true), '')::uuid and "user"."is_platform_admin"
));