import type { AmapContext } from "@/db/context";

import { getAmapBySlug } from "./amap";
import { getCurrentSession } from "./auth/session";

/**
 * Contexte d'une requête dans une AMAP : AMAP de l'adresse, utilisateur connecté, et deuxième
 * vérification faite ou non. À passer à withAmapContext, puis à requireRole.
 * L'AMAP vaut null si l'adresse est inconnue ; l'utilisateur, null si personne n'est connecté.
 */
export async function getAmapContext(slug: string): Promise<AmapContext> {
  const [amap, current] = await Promise.all([getAmapBySlug(slug), getCurrentSession()]);
  return {
    amapId: amap?.id ?? null,
    userId: current?.user.id ?? null,
    secondFactorVerified: Boolean(current?.session.secondFactorVerifiedAt),
  };
}
