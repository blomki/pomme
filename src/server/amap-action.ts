import { redirect } from "next/navigation";

import type { Transaction } from "@/db/client";
import { getDatabase } from "@/db/client";
import { withAmapContext, type AmapContext } from "@/db/context";

import { ForbiddenError, SecondFactorRequiredError, UnauthenticatedError } from "./auth/errors";
import { verificationUrl } from "./auth/second-factor";
import { getAmapContext } from "./context";

/**
 * Exécute, pour une Server Action d'une AMAP, une fonction qui vérifie elle-même le rôle
 * (requireRole), et traduit les refus :
 * - pas connecté → page de connexion ;
 * - deuxième vérification manquante → page de vérification, puis retour à `returnPath` ;
 * - pas le bon rôle dans cette AMAP → résultat { status: "forbidden" }.
 *
 * Dans un module à part : un fichier « use server » ne peut exporter que des actions.
 */
export async function runAmapAction<T>(
  slug: string,
  returnPath: string,
  fn: (tx: Transaction, ctx: AmapContext) => Promise<T>,
): Promise<{ ctx: AmapContext; result: T } | { status: "forbidden" }> {
  const ctx = await getAmapContext(slug);
  try {
    return { ctx, result: await withAmapContext(getDatabase(), ctx, fn) };
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/connexion");
    if (error instanceof SecondFactorRequiredError) redirect(verificationUrl(returnPath));
    if (error instanceof ForbiddenError) return { status: "forbidden" };
    throw error;
  }
}
