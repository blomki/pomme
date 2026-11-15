-- Migration écrite à la main (générée vide par « drizzle-kit generate --custom ») : Drizzle ne
-- sait pas décrire une fonction (voir ADR 0009 et 0011).
--
-- Recherche des producteurs de la plateforme par leur nom, pour « rattacher un producteur
-- existant » à l'AMAP courante (story C1). Le producteur est commun à toutes les AMAP, mais la
-- Row Level Security ne montre à l'application que ceux de l'AMAP courante.
--
-- SECURITY DEFINER, donc limitée à ce seul usage :
-- - réservée aux administrateurs de l'AMAP courante (vérifié ici) ;
-- - ne renvoie que l'identifiant, le nom et la catégorie : jamais le téléphone, l'email ni les
--   AMAP du producteur ;
-- - exclut les producteurs archivés et ceux déjà dans l'AMAP courante ;
-- - au plus 10 résultats, et seulement à partir de 2 caractères ;
-- - les caractères spéciaux de LIKE (% et _) sont neutralisés : on cherche le texte tel quel.
CREATE FUNCTION public.search_producers(p_query text)
RETURNS TABLE (id uuid, name text, category text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_amap uuid := nullif(current_setting('app.amap_id', true), '')::uuid;
  pattern text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.amap_role r
    WHERE r.amap_id = current_amap
      AND r.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND r.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'search_producers : réservé aux administrateurs de l''AMAP courante'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF length(trim(coalesce(p_query, ''))) < 2 THEN
    RETURN;
  END IF;
  pattern := '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
    SELECT p.id, p.name, p.category
    FROM public.producer p
    WHERE p.archived_at IS NULL
      AND p.name ILIKE pattern
      AND NOT EXISTS (
        SELECT 1 FROM public.amap_producer ap
        WHERE ap.producer_id = p.id AND ap.amap_id = current_amap
      )
    ORDER BY p.name
    LIMIT 10;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.search_producers(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.search_producers(text) TO pomme_app;
