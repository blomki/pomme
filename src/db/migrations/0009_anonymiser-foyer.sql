-- Migration écrite à la main (générée vide par « drizzle-kit generate --custom ») : Drizzle ne
-- sait pas décrire une fonction (voir ADR 0009 et 0010).
--
-- Anonymisation RGPD d'un foyer (story A2), irréversible, en une seule transaction.
--
-- SECURITY DEFINER : la fonction s'exécute avec les droits de son propriétaire, hors Row Level
-- Security, parce qu'elle doit :
-- - savoir si une personne est encore active dans une AUTRE AMAP (invisible pour l'application) ;
-- - effacer les données personnelles du journal, que l'application ne peut jamais modifier.
-- Ses droits sont limités à ce seul usage : réservée aux administrateurs de l'AMAP courante, et
-- seulement pour un foyer de cette AMAP (vérifié ici, la base ne fait pas confiance à
-- l'application).
--
-- Ce qu'elle fait :
-- 1. retire à chaque membre ses rôles dans cette AMAP ;
-- 2. remplace, dans le journal de cette AMAP, les valeurs concernant le foyer et ses membres par
--    {"anonymise": true} : la trace (qui, quoi, quand) reste, les données personnelles partent ;
-- 3. renomme le foyer (« Foyer anonymisé 0193a5b2 ») et l'archive ; SUPPRIME les liens entre le
--    foyer et ses membres (seule suppression permise par le modèle de données : la suppression
--    RGPD). Sinon, la Row Level Security laisserait l'AMAP voir encore le nom, l'email et le
--    téléphone d'un membre gardé pour une autre AMAP ;
-- 4. anonymise le compte de chaque membre qui n'est plus actif dans aucune AMAP (ni foyer actif,
--    ni rôle ailleurs) et n'est pas gestionnaire de la plateforme : nom, email, téléphone effacés.
--    Un compte encore actif ailleurs est gardé tel quel : il appartient aussi à l'autre AMAP.
--    À compléter avec la story C1 : un compte lié à un producteur reste actif.
--
-- Elle renvoie les comptes anonymisés : l'application fait ensuite effacer leurs sessions,
-- passkeys et codes par Better Auth (seul autorisé sur ces tables, ADR 0005).
CREATE FUNCTION public.anonymize_household(p_household_id uuid) RETURNS SETOF uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_amap uuid := nullif(current_setting('app.amap_id', true), '')::uuid;
  current_user_id uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  member_ids uuid[];
  member uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.amap_role
    WHERE amap_role.amap_id = current_amap
      AND amap_role.user_id = current_user_id
      AND amap_role.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'anonymize_household : réservé aux administrateurs de l''AMAP courante'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.household h
    WHERE h.id = p_household_id AND h.amap_id = current_amap AND h.anonymized_at IS NULL
  ) THEN
    RAISE EXCEPTION 'anonymize_household : foyer introuvable dans l''AMAP courante, ou déjà anonymisé'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT coalesce(array_agg(hm.user_id), '{}') INTO member_ids
  FROM public.household_member hm WHERE hm.household_id = p_household_id;

  -- 1. Rôles dans cette AMAP.
  DELETE FROM public.amap_role
  WHERE amap_role.amap_id = current_amap AND amap_role.user_id = ANY (member_ids);

  -- 2. Journal de cette AMAP : on garde la ligne, on efface les valeurs.
  UPDATE public.audit_log a
  SET before = CASE WHEN a.before IS NULL THEN NULL ELSE '{"anonymise": true}'::jsonb END,
      after = CASE WHEN a.after IS NULL THEN NULL ELSE '{"anonymise": true}'::jsonb END
  WHERE a.amap_id = current_amap
    AND (
      (a.entity_type = 'household' AND a.entity_id = p_household_id)
      OR (a.entity_type IN ('user', 'amap_role') AND a.entity_id = ANY (member_ids))
    );

  -- 3. Le foyer et ses membres.
  UPDATE public.household
  SET name = 'Foyer anonymisé ' || left(id::text, 8),
      archived_at = coalesce(archived_at, now()),
      anonymized_at = now(),
      updated_at = now()
  WHERE id = p_household_id;

  DELETE FROM public.household_member WHERE household_id = p_household_id;

  -- 4. Les comptes qui ne sont plus actifs nulle part.
  FOREACH member IN ARRAY member_ids LOOP
    IF NOT EXISTS (
         SELECT 1 FROM public.household_member hm
         WHERE hm.user_id = member AND hm.archived_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.amap_role r WHERE r.user_id = member)
       AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = member AND u.is_platform_admin)
    THEN
      UPDATE public."user"
      -- Adresse en .invalid (domaine réservé, jamais distribuable) : reste unique et en minuscules.
      SET email = 'anonyme-' || id::text || '@anonyme.invalid',
          first_name = 'Anonyme',
          last_name = '',
          phone = NULL,
          image = NULL,
          email_verified = false,
          two_factor_enabled = false,
          archived_at = coalesce(archived_at, now()),
          updated_at = now()
      WHERE id = member;
      RETURN NEXT member;
    END IF;
  END LOOP;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.anonymize_household(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.anonymize_household(uuid) TO pomme_app;
