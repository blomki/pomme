-- Migration écrite à la main (générée vide par « drizzle-kit generate --custom ») : Drizzle ne
-- sait pas décrire une fonction (voir ADR 0009 à 0011).
--
-- anonymize_household (migrations 0009 et 0012) anonymise le compte d'un membre qui n'est plus
-- actif dans aucune AMAP. Avec les comptes producteurs (story C1, partie 2), un compte lié à un
-- producteur reste actif lui aussi : le producteur continue de livrer, et son compte lui sert
-- pour toutes les AMAP qu'il livre.
--
-- Le reste de la fonction est inchangé : voir le commentaire de la migration 0009.
CREATE OR REPLACE FUNCTION public.anonymize_household(p_household_id uuid) RETURNS SETOF uuid
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

  -- 1. Rôles dans cette AMAP, et affectations de référent qui en dépendent (le producteur
  --    apparaît alors « sans référent » : tâche Bloquant pour l'admin).
  DELETE FROM public.referent_assignment
  WHERE referent_assignment.amap_id = current_amap
    AND referent_assignment.user_id = ANY (member_ids);
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
       AND NOT EXISTS (SELECT 1 FROM public.producer_user pu WHERE pu.user_id = member)
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
