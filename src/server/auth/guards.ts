import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { amapRole } from "@/db/schema";

import { getAmapBySlug } from "../amap";

import { requireVerifiedSession } from "./second-factor";

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

/** Gestion de la plateforme : connexion, deuxième vérification, puis compte gestionnaire. */
export async function requirePlatformAdminPage() {
  const state = await requireVerifiedSession("/plateforme");
  if (!state.factors.isPlatformAdmin) notFound();
  return state;
}
