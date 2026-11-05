import { and, asc, eq, isNull } from "drizzle-orm";
import { cache } from "react";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { amap } from "@/db/schema";
import { validateAmapSlug } from "@/domain/amap-slug";

/** Informations publiques d'une AMAP : de quoi afficher sa page et appliquer son thème. */
export type PublicAmap = Pick<
  typeof amap.$inferSelect,
  "id" | "slug" | "name" | "theme" | "logoUrl"
>;

const publicColumns = {
  id: amap.id,
  slug: amap.slug,
  name: amap.name,
  theme: amap.theme,
  logoUrl: amap.logoUrl,
};

/**
 * Cherche une AMAP active par son adresse ([domaine]/hommesdeterre → « hommesdeterre »).
 * Renvoie null si l'adresse est mal formée, réservée, inconnue ou archivée.
 *
 * cache() : la mise en page et la page appellent cette fonction pour la même requête ;
 * la base n'est interrogée qu'une fois.
 */
export const getAmapBySlug = cache(async (slug: string): Promise<PublicAmap | null> => {
  if (validateAmapSlug(slug) !== null) return null;
  return withAmapContext(getDatabase(), { amapId: null, userId: null }, async (tx) => {
    const [row] = await tx
      .select(publicColumns)
      .from(amap)
      .where(and(eq(amap.slug, slug), isNull(amap.archivedAt)));
    return row ?? null;
  });
});

/** Toutes les AMAP actives, par nom. */
export async function listAmaps(): Promise<PublicAmap[]> {
  return withAmapContext(getDatabase(), { amapId: null, userId: null }, (tx) =>
    tx.select(publicColumns).from(amap).where(isNull(amap.archivedAt)).orderBy(asc(amap.name)),
  );
}
