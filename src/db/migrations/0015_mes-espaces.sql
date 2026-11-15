-- Migration écrite à la main (« drizzle-kit generate --custom ») : Drizzle ne sait pas décrire
-- une fonction (voir ADR 0009).
--
-- Espaces du compte connecté, toutes AMAP confondues, pour l'envoyer au bon endroit après la
-- connexion et les lister dans « Mon compte ». La Row Level Security ne montre les rôles et les
-- foyers que de l'AMAP courante ; ouvrir ces tables à toutes les AMAP fausserait les politiques
-- qui s'appuient sur ce filtre (« admin de l'AMAP courante »).
--
-- SECURITY DEFINER, donc limitée à ce seul usage :
-- - uniquement les lignes du compte connecté (app.user_id) : rien sur les autres personnes ;
-- - seulement l'adresse et le nom de l'AMAP (déjà publics) et le type d'espace, plus
--   « producteur » si le compte est lié à un producteur actif ;
-- - AMAP et foyers archivés exclus.
CREATE FUNCTION public.list_my_spaces()
RETURNS TABLE (amap_slug text, amap_name text, kind text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT a.slug, a.name, r.role::text
  FROM public.amap_role r
  JOIN public.amap a ON a.id = r.amap_id
  WHERE r.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND a.archived_at IS NULL
  UNION
  SELECT a.slug, a.name, 'famille'
  FROM public.household_member m
  JOIN public.amap a ON a.id = m.amap_id
  WHERE m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND m.archived_at IS NULL
    AND a.archived_at IS NULL
  UNION
  -- Espace producteur, commun à toutes ses AMAP : sans adresse ni nom d'AMAP.
  SELECT '', '', 'producteur'
  FROM public.producer_user pu
  JOIN public.producer p ON p.id = pu.producer_id
  WHERE pu.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND p.archived_at IS NULL
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_my_spaces() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_my_spaces() TO pomme_app;
