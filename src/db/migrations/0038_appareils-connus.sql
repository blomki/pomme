CREATE TABLE "known_device" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_hash" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "known_device_unique" UNIQUE("user_id","device_hash")
);
--> statement-breakpoint
ALTER TABLE "known_device" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "known_device" ADD CONSTRAINT "known_device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "known_device_own" ON "known_device" AS PERMISSIVE FOR ALL TO public USING ("known_device"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("known_device"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);