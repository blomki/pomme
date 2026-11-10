import { and, eq } from "drizzle-orm";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { amapRole } from "@/db/schema";
import { hasAnyRole, type AmapRoleName } from "@/domain/roles";
import { actionNeedsSecondFactor } from "@/domain/second-factor";

import { ForbiddenError, SecondFactorRequiredError, UnauthenticatedError } from "./errors";

/**
 * Vérifie que l'utilisateur connecté a l'un des rôles demandés dans l'AMAP courante,
 * et renvoie tous ses rôles dans cette AMAP.
 *
 * À appeler au début de chaque Server Action, dans la transaction ouverte par
 * withAmapContext. C'est la première barrière ; la Row Level Security de PostgreSQL est la
 * seconde (elle empêche de toute façon de toucher aux données d'une autre AMAP).
 *
 * @throws UnauthenticatedError si personne n'est connecté
 * @throws ForbiddenError si l'utilisateur n'a aucun des rôles demandés
 * @throws SecondFactorRequiredError si seul son rôle d'admin lui donne accès et que la session
 *   n'a pas eu de deuxième vérification (story A1)
 */
export async function requireRole(
  tx: Transaction,
  ctx: AmapContext,
  allowed: readonly AmapRoleName[],
): Promise<AmapRoleName[]> {
  if (!ctx.userId) throw new UnauthenticatedError();
  if (!ctx.amapId) throw new ForbiddenError("Aucune AMAP sélectionnée.");

  const rows = await tx
    .select({ role: amapRole.role })
    .from(amapRole)
    .where(and(eq(amapRole.amapId, ctx.amapId), eq(amapRole.userId, ctx.userId)));
  const roles = rows.map((row) => row.role);

  if (!hasAnyRole(roles, allowed)) throw new ForbiddenError();
  if (actionNeedsSecondFactor(roles, allowed) && !ctx.secondFactorVerified) {
    throw new SecondFactorRequiredError();
  }
  return roles;
}
