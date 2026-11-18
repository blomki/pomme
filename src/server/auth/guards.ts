import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { amapRole } from "@/db/schema";

import { getAmapBySlug } from "../amap";
import { getMyProducerAmaps } from "../producer-amaps";

import { requireVerifiedSession } from "./second-factor";
import { requireSession } from "./session";

/**
 * Espace administrateur d'une AMAP : connexion, deuxième vérification, puis rôle admin dans
 * cette AMAP. Sinon : page 404 (on ne révèle pas l'existence de l'espace).
 * Les Server Actions refont la vérification avec requireRole : cette garde ne protège que
 * l'affichage.
 */
export async function requireAmapAdminPage(slug: string) {
  const amap = await getAmapBySlug(slug);
  if (!amap) notFound();
  const state = await requireVerifiedSession(`/${slug}/admin`);
  const ctx = { amapId: amap.id, userId: state.user.id, secondFactorVerified: state.verified };
  const isAdmin = await withAmapContext(getDatabase(), ctx, async (tx) => {
    const rows = await tx
      .select({ id: amapRole.id })
      .from(amapRole)
      .where(
        and(
          eq(amapRole.amapId, amap.id),
          eq(amapRole.userId, state.user.id),
          eq(amapRole.role, "admin"),
        ),
      );
    return rows.length > 0;
  });
  if (!isAdmin) notFound();
  return { amap, ctx, state };
}

/**
 * Espace producteur (mise en page et pages) : connexion, puis compte lié à un producteur qui
 * livre au moins une AMAP. Sinon : page 404. Renvoie ces AMAP et l'AMAP courante (story C4) ;
 * la page lit ensuite les données dans l'AMAP courante, où la Row Level Security refait le
 * contrôle. cache() : la mise en page et la page l'appellent pour la même requête.
 */
export const requireProducerPage = cache(async () => {
  const session = await requireSession();
  const { amaps, current } = await getMyProducerAmaps(session.user.id);
  if (!current) notFound();
  // Couleurs, police des titres et logo de l'AMAP courante (informations publiques).
  const amap = await getAmapBySlug(current.amapSlug);
  if (!amap) notFound();
  const contextIn = (amapId: string) => ({
    amapId,
    userId: session.user.id,
    secondFactorVerified: Boolean(session.session.secondFactorVerifiedAt),
  });
  return { amaps, current, amap, contextIn };
});

/** Gestion de la plateforme : connexion, deuxième vérification, puis compte gestionnaire. */
export async function requirePlatformAdminPage() {
  const state = await requireVerifiedSession("/plateforme");
  if (!state.factors.isPlatformAdmin) notFound();
  return state;
}

/**
 * Pages du référent qui montrent des données (« Mes producteurs »…) : connexion, puis rôle
 * référent dans cette AMAP. Sinon : page 404. Pas de deuxième vérification : elle n'est exigée
 * que des administrateurs. Les Server Actions refont la vérification avec requireRole.
 */
export async function requireAmapReferentPage(slug: string) {
  const amap = await getAmapBySlug(slug);
  if (!amap) notFound();
  const current = await requireSession();
  const ctx = {
    amapId: amap.id,
    userId: current.user.id,
    secondFactorVerified: Boolean(current.session.secondFactorVerifiedAt),
  };
  const isReferent = await withAmapContext(getDatabase(), ctx, async (tx) => {
    const rows = await tx
      .select({ id: amapRole.id })
      .from(amapRole)
      .where(
        and(
          eq(amapRole.amapId, amap.id),
          eq(amapRole.userId, current.user.id),
          eq(amapRole.role, "referent"),
        ),
      );
    return rows.length > 0;
  });
  if (!isReferent) notFound();
  return { amap, ctx };
}
