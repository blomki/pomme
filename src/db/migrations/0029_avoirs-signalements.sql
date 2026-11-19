ALTER TABLE "credit" ADD COLUMN "report_id" uuid;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_report_unique" ON "credit" USING btree ("report_id");--> statement-breakpoint
ALTER POLICY "credit_select" ON "credit" TO public USING ("credit"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from household_member
  where household_member.household_id = "credit"."household_id"
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "credit"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
        or exists (
  select 1 from producer_user
  where producer_user.producer_id = "credit"."producer_id" and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
) or coalesce(current_setting('app.trusted', true), '') <> ''));--> statement-breakpoint
ALTER POLICY "credit_insert" ON "credit" TO public WITH CHECK ("credit"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "credit"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
        or coalesce(current_setting('app.trusted', true), '') = 'closing_job'));--> statement-breakpoint
ALTER POLICY "credit_update" ON "credit" TO public USING ("credit"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "credit"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
        or coalesce(current_setting('app.trusted', true), '') = 'closing_job')) WITH CHECK ("credit"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "credit"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
        or coalesce(current_setting('app.trusted', true), '') = 'closing_job'));