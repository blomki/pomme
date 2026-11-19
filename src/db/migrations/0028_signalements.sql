CREATE TYPE "public"."report_reason" AS ENUM('missing', 'damaged', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_source" AS ENUM('family', 'admin');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'credited', 'rejected');--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amap_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"reason" "report_reason" NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"source" "report_source" NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"decision_note" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_quantity_positive" CHECK ("report"."quantity" > 0),
	CONSTRAINT "report_other_needs_comment" CHECK ("report"."reason" <> 'other' or length(trim("report"."comment")) > 0),
	CONSTRAINT "report_decided" CHECK (("report"."status" = 'open') = ("report"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "report" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_amap_id_amap_id_fk" FOREIGN KEY ("amap_id") REFERENCES "public"."amap"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_order_line_id_order_line_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_household_fk" FOREIGN KEY ("household_id","amap_id") REFERENCES "public"."household"("id","amap_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_open_idx" ON "report" USING btree ("amap_id") WHERE "report"."status" = 'open';--> statement-breakpoint
CREATE INDEX "report_order_line_idx" ON "report" USING btree ("order_line_id");--> statement-breakpoint
CREATE POLICY "report_select" ON "report" AS PERMISSIVE FOR SELECT TO public USING ("report"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from household_member
  where household_member.household_id = "report"."household_id"
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
)
        or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or exists (
  select 1 from order_line
  join "order" on "order".id = order_line.order_id
  where order_line.id = "report"."order_line_id"
    and exists (
  select 1 from catalog where catalog.id = "order".catalog_id and exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
)
)));--> statement-breakpoint
CREATE POLICY "report_insert" ON "report" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("report"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
        or (exists (
  select 1 from household_member
  where household_member.household_id = "report"."household_id"
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
) and "report"."source" = 'family' and "report"."status" = 'open'
          and "report"."created_by" = nullif(current_setting('app.user_id', true), '')::uuid)));--> statement-breakpoint
CREATE POLICY "report_update" ON "report" AS PERMISSIVE FOR UPDATE TO public USING ("report"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
        or exists (
  select 1 from order_line
  join "order" on "order".id = order_line.order_id
  where order_line.id = "report"."order_line_id"
    and exists (
  select 1 from catalog where catalog.id = "order".catalog_id and exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
)
))) WITH CHECK ("report"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
        or exists (
  select 1 from order_line
  join "order" on "order".id = order_line.order_id
  where order_line.id = "report"."order_line_id"
    and exists (
  select 1 from catalog where catalog.id = "order".catalog_id and exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
)
)));