CREATE POLICY "product_insert_by_admin" ON "product" AS PERMISSIVE FOR INSERT TO public WITH CHECK (exists (
  select 1 from amap_role where amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid and amap_role.role = 'admin'
)
        and exists (select 1 from amap_producer where amap_producer.producer_id = "product"."producer_id"));