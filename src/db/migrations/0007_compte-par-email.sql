-- Migration écrite à la main (générée vide par « drizzle-kit generate --custom ») : Drizzle ne
-- sait pas décrire une fonction dans le schéma.
--
-- Retrouve un compte par son email, pour rattacher à un foyer une personne déjà inscrite dans
-- une autre AMAP (story A2 ; prévu par l'ADR 0003). Le compte est unique sur la plateforme, mais
-- la Row Level Security cache à l'application les comptes qui n'appartiennent pas à l'AMAP
-- courante : sans cette fonction, on créerait un doublon (refusé par l'unicité de l'email).
--
-- SECURITY DEFINER : la fonction s'exécute avec les droits de son propriétaire, qui n'est pas
-- soumis à la RLS. Ses droits sont donc limités à ce seul usage :
-- - réservée aux administrateurs de l'AMAP courante (vérifié ici, la base ne fait pas confiance
--   à l'application) ;
-- - ne renvoie que l'identifiant du compte, jamais son nom, son téléphone ou ses AMAP ;
-- - search_path figé : un objet malveillant d'un autre schéma ne peut pas se faire passer pour
--   une table d'ici.
CREATE FUNCTION public.find_user_id_by_email(p_email text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  found_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.amap_role
    WHERE amap_role.amap_id = nullif(current_setting('app.amap_id', true), '')::uuid
      AND amap_role.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND amap_role.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'find_user_id_by_email : réservé aux administrateurs de l''AMAP courante'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT u.id INTO found_id FROM public."user" u WHERE u.email = lower(trim(p_email));
  RETURN found_id;
END;
$$;
--> statement-breakpoint
-- Par défaut, tout le monde peut appeler une fonction : on retire ce droit, puis on le donne au
-- seul rôle de l'application.
REVOKE ALL ON FUNCTION public.find_user_id_by_email(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(text) TO pomme_app;
