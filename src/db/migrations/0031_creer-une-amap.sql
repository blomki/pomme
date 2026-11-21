-- Migration écrite à la main (générée vide par « drizzle-kit generate --custom ») : Drizzle ne
-- sait pas décrire une fonction (voir ADR 0009).
--
-- create_amap : création d'une AMAP par le gestionnaire de la plateforme (story J1, ADR 0031).
--
-- Pourquoi une fonction dédiée : le rôle de l'application n'a aucun droit de créer une AMAP
-- (pas de politique INSERT sur amap), et il ne peut écrire un rôle admin que dans l'AMAP
-- courante. Plutôt que d'ouvrir un contournement général de la Row Level Security, cette seule
-- fonction fait la création, en une transaction, et seulement pour un gestionnaire :
--   1. l'AMAP ;
--   2. le compte du premier administrateur, s'il n'existe pas encore (adresse en minuscules) ;
--   3. son rôle admin dans la nouvelle AMAP ;
--   4. une ligne du journal, au nom du gestionnaire.
-- Les identifiants (UUID v7) sont tirés par l'application, comme pour toutes les tables.
-- L'adresse déjà prise est refusée par l'index unique de amap.slug (erreur 23505) ; les mots
-- réservés et les autres champs sont contrôlés avant, par l'application (domain/amap-creation).
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
  p_audit_id uuid
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
-- Par défaut, tout le monde peut appeler une fonction : on retire ce droit, puis on le donne au
-- seul rôle de l'application.
REVOKE ALL ON FUNCTION public.create_amap(uuid, text, text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_amap(uuid, text, text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid, uuid) TO pomme_app;
