import { sql } from "drizzle-orm";

import { getDatabase, type Database } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { AMAP_SPACES, sortSpaces, type AmapSpace, type AmapSpaceKind } from "@/domain/spaces";

export type MySpaces = { amapSpaces: AmapSpace[]; isProducer: boolean };

/**
 * Espaces du compte, toutes AMAP confondues (fonction list_my_spaces, migration 0015) :
 * rôles d'admin et de référent, foyer actif, et compte lié à un producteur.
 */
export async function listMySpaces(
  userId: string,
  db: Database = getDatabase(),
): Promise<MySpaces> {
  const rows = await withAmapContext(db, { amapId: null, userId }, async (tx) => {
    const result = await tx.execute<{ amap_slug: string; amap_name: string; kind: string }>(
      sql`select amap_slug, amap_name, kind from list_my_spaces()`,
    );
    return result.rows;
  });
  const amapSpaces = sortSpaces(
    rows.flatMap((row) =>
      AMAP_SPACES.includes(row.kind as AmapSpaceKind)
        ? [{ amapSlug: row.amap_slug, amapName: row.amap_name, kind: row.kind as AmapSpaceKind }]
        : [],
    ),
  );
  return { amapSpaces, isProducer: rows.some((row) => row.kind === "producteur") };
}

/** Espaces « ordinateur » (administration, référent) du compte dans une AMAP. */
export async function deskAreasIn(
  userId: string | undefined,
  amapSlug: string,
): Promise<("admin" | "referent")[]> {
  if (!userId) return [];
  const { amapSpaces } = await listMySpaces(userId);
  return amapSpaces.flatMap((space) =>
    space.amapSlug === amapSlug && space.kind !== "famille" ? [space.kind] : [],
  );
}
