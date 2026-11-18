-- Migration écrite à la main (« drizzle-kit generate --custom ») : Drizzle ne sait pas décrire
-- une contrainte d'exclusion (voir ADR 0009 et ADR 0017).
--
-- Deux adhésions non archivées d'un même foyer ne se chevauchent pas (story B1). Les jours de
-- début et de fin sont inclus : « [] ». La base refuse le chevauchement même si deux
-- enregistrements arrivent en même temps, ce qu'une vérification dans l'application ne
-- garantirait pas.
--
-- btree_gist permet de mêler, dans un même index GiST, l'égalité sur le foyer (uuid) et le
-- recouvrement des périodes (daterange). Extension « de confiance » depuis PostgreSQL 13 : le
-- propriétaire de la base peut l'installer sans être superutilisateur.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_no_overlap"
  EXCLUDE USING gist (
    "household_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("archived_at" IS NULL);
