-- Migration écrite à la main (générée vide par « drizzle-kit generate --custom ») : Drizzle ne
-- sait pas décrire une fonction (voir ADR 0009).
--
-- Fiche #125 : sur la fiche d'un foyer, « Réinitialiser la deuxième vérification » n'apparaît
-- que pour un membre qui a quelque chose à réinitialiser (application d'authentification ou
-- passkey). L'application lit `user.two_factor_enabled`, mais pas la table `passkey`, réservée à
-- la connexion de Better Auth (ADR 0005).
--
-- Plutôt que d'ouvrir cette table au rôle de l'application, cette fonction ne renvoie que les
-- identifiants des personnes qui ont au moins un moyen de vérification :
-- - réservée aux administrateurs de l'AMAP courante (vérifié ici) ;
-- - limitée aux personnes de l'AMAP courante (rôle ou foyer actif) : rien sur les autres comptes ;
-- - ni clé, ni nom, ni date : un simple « oui ».
CREATE FUNCTION public.amap_members_with_second_factor(p_user_ids uuid[]) RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_amap_id uuid := nullif(current_setting('app.amap_id', true), '')::uuid;
  current_user_id uuid := nullif(current_setting('app.user_id', true), '')::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.amap_role r
    WHERE r.amap_id = current_amap_id AND r.user_id = current_user_id AND r.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'amap_members_with_second_factor : réservé aux administrateurs de l''AMAP courante'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT u.id FROM public."user" u
  WHERE u.id = ANY (p_user_ids)
    AND (
      EXISTS (SELECT 1 FROM public.amap_role r
              WHERE r.user_id = u.id AND r.amap_id = current_amap_id)
      OR EXISTS (SELECT 1 FROM public.household_member m
                 WHERE m.user_id = u.id AND m.amap_id = current_amap_id
                   AND m.archived_at IS NULL)
    )
    AND (u.two_factor_enabled OR EXISTS (SELECT 1 FROM public.passkey p WHERE p.user_id = u.id));
END;
$$;
--> statement-breakpoint
-- Par défaut, tout le monde peut appeler une fonction : on retire ce droit, puis on le donne au
-- seul rôle de l'application.
REVOKE ALL ON FUNCTION public.amap_members_with_second_factor(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.amap_members_with_second_factor(uuid[]) TO pomme_app;
