DROP POLICY "amap_producer_isolation" ON "amap_producer" CASCADE;--> statement-breakpoint
DROP POLICY "amap_role_isolation" ON "amap_role" CASCADE;--> statement-breakpoint
DROP POLICY "distribution_isolation" ON "distribution" CASCADE;--> statement-breakpoint
DROP POLICY "household_isolation" ON "household" CASCADE;--> statement-breakpoint
DROP POLICY "household_member_isolation" ON "household_member" CASCADE;--> statement-breakpoint
DROP POLICY "referent_assignment_isolation" ON "referent_assignment" CASCADE;--> statement-breakpoint
CREATE POLICY "amap_producer_select" ON "amap_producer" AS PERMISSIVE FOR SELECT TO public USING ("amap_producer"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and true);--> statement-breakpoint
CREATE POLICY "amap_producer_insert" ON "amap_producer" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("amap_producer"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "amap_producer_update" ON "amap_producer" AS PERMISSIVE FOR UPDATE TO public USING ("amap_producer"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or exists (
        select 1 from referent_assignment
        where referent_assignment.amap_producer_id = "amap_producer"."id"
          and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      ))) WITH CHECK ("amap_producer"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or exists (
        select 1 from referent_assignment
        where referent_assignment.amap_producer_id = "amap_producer"."id"
          and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      )));--> statement-breakpoint
CREATE POLICY "amap_role_select" ON "amap_role" AS PERMISSIVE FOR SELECT TO public USING ("amap_role"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and true);--> statement-breakpoint
CREATE POLICY "amap_role_insert" ON "amap_role" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("amap_role"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "amap_role_update" ON "amap_role" AS PERMISSIVE FOR UPDATE TO public USING ("amap_role"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)) WITH CHECK ("amap_role"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "amap_role_delete" ON "amap_role" AS PERMISSIVE FOR DELETE TO public USING ("amap_role"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "distribution_select" ON "distribution" AS PERMISSIVE FOR SELECT TO public USING ("distribution"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and true);--> statement-breakpoint
CREATE POLICY "distribution_insert" ON "distribution" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("distribution"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "distribution_update" ON "distribution" AS PERMISSIVE FOR UPDATE TO public USING ("distribution"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)) WITH CHECK ("distribution"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "household_select" ON "household" AS PERMISSIVE FOR SELECT TO public USING ("household"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from household_member
  where household_member.household_id = "household"."id"
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and amap_role.role in ('admin', 'referent')
)
        or exists (select 1 from "order" where "order".household_id = "household"."id")
        or exists (select 1 from cheque where cheque.household_id = "household"."id")
        or coalesce(current_setting('app.trusted', true), '') <> ''));--> statement-breakpoint
CREATE POLICY "household_insert" ON "household" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("household"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "household_update" ON "household" AS PERMISSIVE FOR UPDATE TO public USING ("household"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)) WITH CHECK ("household"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "household_member_select" ON "household_member" AS PERMISSIVE FOR SELECT TO public USING ("household_member"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and ("household_member"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid
        or "household_member"."household_id" in (select my_household_ids())
        or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and amap_role.role in ('admin', 'referent')
) or coalesce(current_setting('app.trusted', true), '') <> ''));--> statement-breakpoint
CREATE POLICY "household_member_insert" ON "household_member" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("household_member"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "household_member_update" ON "household_member" AS PERMISSIVE FOR UPDATE TO public USING ("household_member"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)) WITH CHECK ("household_member"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "household_member_delete" ON "household_member" AS PERMISSIVE FOR DELETE TO public USING ("household_member"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "referent_assignment_select" ON "referent_assignment" AS PERMISSIVE FOR SELECT TO public USING ("referent_assignment"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and true);--> statement-breakpoint
CREATE POLICY "referent_assignment_insert" ON "referent_assignment" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("referent_assignment"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
CREATE POLICY "referent_assignment_delete" ON "referent_assignment" AS PERMISSIVE FOR DELETE TO public USING ("referent_assignment"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
ALTER POLICY "amap_update" ON "amap" TO public USING ("amap"."id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)) WITH CHECK ("amap"."id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
ALTER POLICY "membership_select" ON "membership" TO public USING ("membership"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from household_member
  where household_member.household_id = "membership"."household_id"
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and amap_role.role in ('admin', 'referent')
) or coalesce(current_setting('app.trusted', true), '') <> ''));--> statement-breakpoint
ALTER POLICY "membership_insert" ON "membership" TO public WITH CHECK ("membership"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
ALTER POLICY "membership_update" ON "membership" TO public USING ("membership"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)) WITH CHECK ("membership"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
ALTER POLICY "order_period_select" ON "order_period" TO public USING ("order_period"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and true);--> statement-breakpoint
ALTER POLICY "order_period_insert" ON "order_period" TO public WITH CHECK ("order_period"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
));--> statement-breakpoint
ALTER POLICY "order_period_update" ON "order_period" TO public USING ("order_period"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or coalesce(current_setting('app.trusted', true), '') = 'closing_job')) WITH CHECK ("order_period"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or coalesce(current_setting('app.trusted', true), '') = 'closing_job'));