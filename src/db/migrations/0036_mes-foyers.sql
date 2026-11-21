-- Migration écrite à la main (générée vide par « drizzle-kit generate --custom ») : Drizzle ne
-- sait pas décrire une fonction (voir ADR 0009).
--
-- my_household_ids : foyers dont la personne connectée est membre (non archivé), dans l'AMAP
-- courante (story S13, ADR 0035). Sert à la politique de lecture de household_member : un
-- membre voit les autres membres de son foyer. Une politique de household_member ne peut pas
-- interroger household_member elle-même (PostgreSQL refuse la récursion) : cette fonction lit la
-- table sans la Row Level Security (SECURITY DEFINER), mais ne renvoie que les foyers de la
-- personne connectée, rien d'autre.
CREATE FUNCTION public.my_household_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT hm.household_id
  FROM public.household_member hm
  WHERE hm.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND hm.amap_id = nullif(current_setting('app.amap_id', true), '')::uuid
    AND hm.archived_at IS NULL;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.my_household_ids() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.my_household_ids() TO pomme_app;
