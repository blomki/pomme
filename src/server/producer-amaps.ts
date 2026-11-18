import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDatabase, type Database } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { user } from "@/db/schema";
import { pickCurrentAmap } from "@/domain/producers";

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

/**
 * AMAP courante de l'espace producteur (story C4) : celle gardée avec le compte, si elle est
 * toujours dans sa liste, sinon la première. Renvoie aussi la liste, pour le choix à l'écran.
 */
export async function getMyProducerAmaps(
  userId: string,
  db: Database = getDatabase(),
): Promise<{ amaps: ProducerAmap[]; current: ProducerAmap | undefined }> {
  const amaps = await listMyProducerAmaps(userId, db);
  const chosen = await withAmapContext(db, { amapId: null, userId }, async (tx) => {
    // Lecture de son propre compte : permise hors de toute AMAP (politique user_select).
    const [row] = await tx
      .select({ id: user.currentAmapProducerId })
      .from(user)
      .where(eq(user.id, userId));
    return row?.id ?? null;
  });
  return { amaps, current: pickCurrentAmap(amaps, chosen) };
}

const chooseSchema = z.object({ amapProducerId: z.uuid() });

export type ChooseAmapResult = { status: "saved"; amapName: string } | { status: "forbidden" };

/**
 * Change l'AMAP courante du producteur. Seulement une AMAP de SA liste (fonction
 * list_my_producer_amaps) : un identifiant d'un autre producteur est refusé. Le choix est
 * écrit sur son propre compte, que la Row Level Security (user_update) est seule à permettre.
 */
export async function chooseCurrentProducerAmap(
  userId: string,
  input: unknown,
  db: Database = getDatabase(),
): Promise<ChooseAmapResult> {
  const parsed = chooseSchema.safeParse(input);
  if (!parsed.success) return { status: "forbidden" };
  const amaps = await listMyProducerAmaps(userId, db);
  const chosen = amaps.find((a) => a.amapProducerId === parsed.data.amapProducerId);
  if (!chosen) return { status: "forbidden" };
  await withAmapContext(db, { amapId: null, userId }, (tx) =>
    tx
      .update(user)
      .set({ currentAmapProducerId: chosen.amapProducerId })
      .where(eq(user.id, userId)),
  );
  return { status: "saved", amapName: chosen.amapName };
}
