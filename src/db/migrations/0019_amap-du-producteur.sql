-- Migration écrite à la main (« drizzle-kit generate --custom ») : Drizzle ne sait pas décrire
-- une fonction (voir ADR 0009).
--
-- AMAP livrées par le producteur du compte connecté (story C2, écran P2) : l'espace producteur
-- est commun à toutes ses AMAP, il navigue donc hors de toute AMAP (app.amap_id vide). Or la
-- Row Level Security ne montre les liens producteur–AMAP (amap_producer) que de l'AMAP
-- courante. Une politique « le producteur voit ses propres liens » ferait boucle avec celle de
-- producer_user, qui lit déjà amap_producer (PostgreSQL refuse : « infinite recursion »).
-- Même solution que list_my_spaces (migration 0015).
--
-- SECURITY DEFINER, donc limitée à ce seul usage :
-- - uniquement les producteurs liés au compte connecté (app.user_id) ;
-- - seulement l'identifiant du lien, l'adresse et le nom de l'AMAP (déjà publics) et le nom
--   du producteur (le sien) ;
-- - liens inactifs ou archivés, AMAP et producteurs archivés exclus.
-- Le catalogue lui-même se lit ensuite DANS l'AMAP choisie, avec la RLS habituelle.
CREATE FUNCTION public.list_my_producer_amaps()
RETURNS TABLE (amap_producer_id uuid, amap_id uuid, amap_slug text, amap_name text, producer_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT ap.id, a.id, a.slug, a.name, p.name
  FROM public.producer_user pu
  JOIN public.producer p ON p.id = pu.producer_id
  JOIN public.amap_producer ap ON ap.producer_id = p.id
  JOIN public.amap a ON a.id = ap.amap_id
  WHERE pu.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND p.archived_at IS NULL
    AND ap.active
    AND ap.archived_at IS NULL
    AND a.archived_at IS NULL
  ORDER BY a.name, p.name
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_my_producer_amaps() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_my_producer_amaps() TO pomme_app;
