-- Migration écrite à la main (générée vide par « drizzle-kit generate --custom ») : Drizzle ne
-- sait pas décrire une fonction (voir ADR 0009).
--
-- Réinitialisation de la deuxième vérification par le gestionnaire de la plateforme (story S10b,
-- ADR 0047). Deux fonctions étroites, comme create_amap (ADR 0031) :
--   - platform_find_account : retrouver un compte par son adresse email ;
--   - platform_reset_second_factor : vérifier qu'on peut le réinitialiser et l'inscrire au
--     journal de la plateforme.
--
-- Pourquoi des fonctions : la Row Level Security cache au gestionnaire les comptes des AMAP (il
-- n'est membre d'aucune), et l'application ne peut pas écrire dans platform_audit_log. Plutôt
-- qu'un contournement général, ces fonctions vérifient elles-mêmes que la personne connectée
-- (app.user_id) est gestionnaire, et ne renvoient que le strict nécessaire.
--
-- Le retrait des facteurs et des sessions est fait ensuite par l'application, avec la connexion
-- de Better Auth (seule à toucher ces tables, ADR 0005), dans la même requête : s'il échoue, la
-- transaction est annulée et la ligne du journal avec.
CREATE FUNCTION public.platform_find_account(p_email text)
RETURNS TABLE (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  is_platform_admin boolean,
  has_second_factor boolean,
  amap_names text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_user_id uuid := nullif(current_setting('app.user_id', true), '')::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."user" u
    WHERE u.id = current_user_id AND u.is_platform_admin AND u.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'platform_find_account : réservé aux gestionnaires de la plateforme'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Les AMAP de la personne (rôle, foyer actif, compte producteur) aident le gestionnaire à
  -- s'assurer que c'est bien elle avant d'agir.
  RETURN QUERY
  SELECT u.id, u.email, u.first_name, u.last_name, u.is_platform_admin,
         u.two_factor_enabled OR EXISTS (SELECT 1 FROM public.passkey p WHERE p.user_id = u.id),
         ARRAY(
           SELECT a.name FROM public.amap a
           WHERE a.id IN (
             SELECT r.amap_id FROM public.amap_role r WHERE r.user_id = u.id
             UNION
             SELECT m.amap_id FROM public.household_member m
             WHERE m.user_id = u.id AND m.archived_at IS NULL
             UNION
             SELECT ap.amap_id FROM public.amap_producer ap
             JOIN public.producer_user pu ON pu.producer_id = ap.producer_id
             WHERE pu.user_id = u.id AND ap.archived_at IS NULL
           )
           ORDER BY a.name
         )
  FROM public."user" u
  WHERE u.email = lower(trim(p_email)) AND u.archived_at IS NULL;
END;
$$;
--> statement-breakpoint
-- Renvoie « reset » (journalisé), « not_found » ou « platform_admin » (le compte d'un
-- gestionnaire, y compris le sien, ne se réinitialise pas ainsi : c'est le compte qui a le plus
-- de pouvoir, et un gestionnaire bloqué passe par l'hébergeur).
CREATE FUNCTION public.platform_reset_second_factor(p_user_id uuid, p_audit_id uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_user_id uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  target public."user"%ROWTYPE;
  passkey_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."user" u
    WHERE u.id = current_user_id AND u.is_platform_admin AND u.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'platform_reset_second_factor : réservé aux gestionnaires de la plateforme'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO target FROM public."user" u WHERE u.id = p_user_id AND u.archived_at IS NULL;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF target.is_platform_admin THEN
    RETURN 'platform_admin';
  END IF;

  SELECT count(*) INTO passkey_count FROM public.passkey p WHERE p.user_id = p_user_id;
  INSERT INTO public.platform_audit_log (id, actor_user_id, entity_type, entity_id, action,
                                         before, after)
  VALUES (p_audit_id, current_user_id, 'user', p_user_id, 'reset_second_factor',
          jsonb_build_object('twoFactorEnabled', target.two_factor_enabled,
                             'passkeys', passkey_count),
          jsonb_build_object('twoFactorEnabled', false, 'passkeys', 0));
  RETURN 'reset';
END;
$$;
--> statement-breakpoint
-- Par défaut, tout le monde peut appeler une fonction : on retire ce droit, puis on le donne au
-- seul rôle de l'application.
REVOKE ALL ON FUNCTION public.platform_find_account(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.platform_find_account(text) TO pomme_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.platform_reset_second_factor(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.platform_reset_second_factor(uuid, uuid) TO pomme_app;
