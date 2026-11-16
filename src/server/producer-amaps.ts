import { sql } from "drizzle-orm";

import { getDatabase, type Database } from "@/db/client";
import { withAmapContext } from "@/db/context";

/** Une AMAP livrée par le producteur du compte connecté. */
export type ProducerAmap = {
  /** Identifiant du producteur DANS cette AMAP (amap_producer). */
  amapProducerId: string;
  amapId: string;
  amapSlug: string;
  amapName: string;
  producerName: string;
};

/**
 * AMAP livrées par le ou les producteurs liés au compte (fonction list_my_producer_amaps,
 * migration 0019), par nom d'AMAP. Liste vide : le compte n'est lié à aucun producteur actif.
 *
 * Lue hors de toute AMAP (amap_id vide) : l'espace producteur est commun à toutes ses AMAP.
 */
export async function listMyProducerAmaps(
  userId: string,
  db: Database = getDatabase(),
): Promise<ProducerAmap[]> {
  return withAmapContext(db, { amapId: null, userId }, async (tx) => {
    const result = await tx.execute<{
      amap_producer_id: string;
      amap_id: string;
      amap_slug: string;
      amap_name: string;
      producer_name: string;
    }>(
      sql`select amap_producer_id, amap_id, amap_slug, amap_name, producer_name
          from list_my_producer_amaps()`,
    );
    return result.rows.map((row) => ({
      amapProducerId: row.amap_producer_id,
      amapId: row.amap_id,
      amapSlug: row.amap_slug,
      amapName: row.amap_name,
      producerName: row.producer_name,
    }));
  });
}
