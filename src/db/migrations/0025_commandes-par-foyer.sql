ALTER POLICY "cheque_select" ON "cheque" TO public USING ("cheque"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from household_member
  where household_member.household_id = "cheque"."household_id"
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "cheque"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
        or exists (
  select 1 from producer_user
  where producer_user.producer_id = "cheque"."producer_id" and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
) or coalesce(current_setting('app.trusted', true), '') <> ''));--> statement-breakpoint
ALTER POLICY "cheque_insert" ON "cheque" TO public WITH CHECK ("cheque"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "cheque"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
        or coalesce(current_setting('app.trusted', true), '') = 'closing_job'));--> statement-breakpoint
ALTER POLICY "cheque_update" ON "cheque" TO public USING ("cheque"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "cheque"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
        or coalesce(current_setting('app.trusted', true), '') = 'closing_job')) WITH CHECK ("cheque"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
) or exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = "cheque"."producer_id"
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
        or coalesce(current_setting('app.trusted', true), '') = 'closing_job'));--> statement-breakpoint
ALTER POLICY "order_select" ON "order" TO public USING ("order"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and ((exists (
  select 1 from household_member
  where household_member.household_id = "order"."household_id"
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
    or exists (
  select 1 from catalog where catalog.id = "order"."catalog_id" and exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
))
    or exists (
  select 1 from catalog where catalog.id = "order"."catalog_id" and exists (
  select 1 from producer_user
  where producer_user.producer_id = catalog.producer_id and producer_user.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
) or coalesce(current_setting('app.trusted', true), '') <> ''));--> statement-breakpoint
ALTER POLICY "order_insert" ON "order" TO public WITH CHECK ("order"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from household_member
  where household_member.household_id = "order"."household_id"
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
    or exists (
  select 1 from catalog where catalog.id = "order"."catalog_id" and exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
)));--> statement-breakpoint
ALTER POLICY "order_update" ON "order" TO public USING ("order"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from household_member
  where household_member.household_id = "order"."household_id"
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
    or exists (
  select 1 from catalog where catalog.id = "order"."catalog_id" and exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
))) WITH CHECK ("order"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and (exists (
  select 1 from household_member
  where household_member.household_id = "order"."household_id"
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
    or exists (
  select 1 from catalog where catalog.id = "order"."catalog_id" and exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
)));--> statement-breakpoint
ALTER POLICY "order_line_select" ON "order_line" TO public USING ("order_line"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (select 1 from "order" where "order".id = "order_line"."order_id"));--> statement-breakpoint
ALTER POLICY "order_line_insert" ON "order_line" TO public WITH CHECK ("order_line"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
        select 1 from "order" where "order".id = "order_line"."order_id"
          and (exists (
  select 1 from household_member
  where household_member.household_id = "order".household_id
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
    or exists (
  select 1 from catalog where catalog.id = "order".catalog_id and exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
))
      ));--> statement-breakpoint
ALTER POLICY "order_line_update" ON "order_line" TO public USING ("order_line"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
        select 1 from "order" where "order".id = "order_line"."order_id"
          and (exists (
  select 1 from household_member
  where household_member.household_id = "order".household_id
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
    or exists (
  select 1 from catalog where catalog.id = "order".catalog_id and exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
))
      )) WITH CHECK ("order_line"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
        select 1 from "order" where "order".id = "order_line"."order_id"
          and (exists (
  select 1 from household_member
  where household_member.household_id = "order".household_id
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
    or exists (
  select 1 from catalog where catalog.id = "order".catalog_id and exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
))
      ));--> statement-breakpoint
ALTER POLICY "order_line_delete" ON "order_line" TO public USING ("order_line"."amap_id" = nullif(current_setting('app.amap_id', true), '')::uuid and exists (
        select 1 from "order" where "order".id = "order_line"."order_id"
          and (exists (
  select 1 from household_member
  where household_member.household_id = "order".household_id
    and household_member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and household_member.archived_at is null
) or exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
    or exists (
  select 1 from catalog where catalog.id = "order".catalog_id and exists (
  select 1 from referent_assignment
  join amap_producer on amap_producer.id = referent_assignment.amap_producer_id
  where amap_producer.producer_id = catalog.producer_id
    and referent_assignment.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
))
      ));