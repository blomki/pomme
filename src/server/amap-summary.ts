import { and, count, eq, isNull } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { amapProducer, household } from "@/db/schema";

import { getAmapContext } from "./context";

// Carte de l'AMAP sous le menu des espaces admin et référent (story S14) : « N foyers actifs ·
// N producteurs ». Lecture seule, filtrée par la RLS : l'équipe (admin, référent) voit les foyers.

export type AmapSummary = { households: number; producers: number };

/** Foyers non archivés et producteurs actifs de l'AMAP, vus par la personne connectée. */
export async function getAmapSummary(slug: string): Promise<AmapSummary> {
  const ctx = await getAmapContext(slug);
  if (!ctx.amapId || !ctx.userId) return { households: 0, producers: 0 };
  const amapId = ctx.amapId;
  return withAmapContext(getDatabase(), ctx, async (tx) => {
    const [households] = await tx
      .select({ n: count() })
      .from(household)
      .where(and(eq(household.amapId, amapId), isNull(household.archivedAt)));
    const [producers] = await tx
      .select({ n: count() })
      .from(amapProducer)
      .where(
        and(
          eq(amapProducer.amapId, amapId),
          eq(amapProducer.active, true),
          isNull(amapProducer.archivedAt),
        ),
      );
    return { households: households?.n ?? 0, producers: producers?.n ?? 0 };
  });
}
