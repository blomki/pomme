-- Migration écrite à la main (générée vide par « drizzle-kit generate --custom ») : Drizzle ne
-- sait pas décrire une fonction ni une reprise de données (voir ADR 0009).
--
-- Pages obligatoires du site public (story H2, ADR 0033) : chaque AMAP a une page d'accueil et
-- une page de mentions légales, créées en brouillon.
--   1. Reprise : les AMAP qui existent déjà reçoivent les deux pages.
--   2. create_amap (ADR 0031) les crée désormais avec l'AMAP, dans la même transaction. Ses
--      paramètres changent (deux identifiants de plus) : l'ancienne version est retirée.

-- UUID v7 (horodaté, comme ceux de l'application) pour la reprise : PostgreSQL 17 n'en fabrique
-- pas encore. Fonction temporaire, propre à cette migration.
CREATE FUNCTION pg_temp.uuid_v7() RETURNS uuid
LANGUAGE sql VOLATILE
AS $$
  SELECT encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
        PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
        FROM 1 FOR 6),
      52, 1), 53, 1),
    'hex')::uuid;
$$;
--> statement-breakpoint
INSERT INTO public.page (id, amap_id, role, title, slug, in_menu, menu_position)
SELECT pg_temp.uuid_v7(), a.id, 'home', 'Accueil', 'accueil', true, 0
FROM public.amap a
WHERE NOT EXISTS (SELECT 1 FROM public.page p WHERE p.amap_id = a.id AND p.role = 'home');
--> statement-breakpoint
INSERT INTO public.page (id, amap_id, role, title, slug, in_menu, menu_position)
SELECT pg_temp.uuid_v7(), a.id, 'legal', 'Mentions légales', 'mentions-legales', false, 0
FROM public.amap a
WHERE NOT EXISTS (SELECT 1 FROM public.page p WHERE p.amap_id = a.id AND p.role = 'legal');
--> statement-breakpoint
DROP FUNCTION public.create_amap(uuid, text, text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid, uuid);
--> statement-breakpoint
-- Même fonction que la migration 0031 (voir ses commentaires), avec les deux pages obligatoires.
CREATE FUNCTION public.create_amap(
  p_amap_id uuid,
  p_slug text,
  p_name text,
  p_theme jsonb,
  p_settings jsonb,
  p_place text,
  p_timezone text,
  p_contact_email text,
  p_new_user_id uuid,
  p_admin_email text,
  p_admin_first_name text,
  p_admin_last_name text,
  p_role_id uuid,
  p_audit_id uuid,
  p_home_page_id uuid,
  p_legal_page_id uuid
) RETURNS TABLE (admin_user_id uuid, admin_created boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_user_id uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  admin_email text := lower(trim(p_admin_email));
  found_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."user" u
    WHERE u.id = current_user_id AND u.is_platform_admin AND u.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'create_amap : réservé aux gestionnaires de la plateforme'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.amap (id, slug, name, theme, settings, distribution_place, timezone,
                           contact_email, created_by)
  VALUES (p_amap_id, p_slug, trim(p_name), p_theme, p_settings, trim(p_place), p_timezone,
          nullif(lower(trim(coalesce(p_contact_email, ''))), ''), current_user_id);

  -- Pages obligatoires, en brouillon : l'administrateur les complète avant de les publier.
  INSERT INTO public.page (id, amap_id, role, title, slug, in_menu, menu_position, created_by)
  VALUES (p_home_page_id, p_amap_id, 'home', 'Accueil', 'accueil', true, 0, current_user_id),
         (p_legal_page_id, p_amap_id, 'legal', 'Mentions légales', 'mentions-legales', false, 0,
          current_user_id);

  SELECT u.id INTO found_id FROM public."user" u WHERE u.email = admin_email;
  IF found_id IS NULL THEN
    INSERT INTO public."user" (id, email, first_name, last_name)
    VALUES (p_new_user_id, admin_email, trim(p_admin_first_name), trim(p_admin_last_name));
  END IF;

  INSERT INTO public.amap_role (id, amap_id, user_id, role, created_by)
  VALUES (p_role_id, p_amap_id, coalesce(found_id, p_new_user_id), 'admin', current_user_id);

  INSERT INTO public.audit_log (id, amap_id, actor_user_id, entity_type, entity_id, action, after)
  VALUES (p_audit_id, p_amap_id, current_user_id, 'amap', p_amap_id, 'create',
          jsonb_build_object('slug', p_slug, 'name', trim(p_name),
                             'adminUserId', coalesce(found_id, p_new_user_id),
                             'adminCreated', found_id IS NULL));

  RETURN QUERY SELECT coalesce(found_id, p_new_user_id), found_id IS NULL;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_amap(uuid, text, text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid, uuid, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_amap(uuid, text, text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid, uuid, uuid, uuid) TO pomme_app;
