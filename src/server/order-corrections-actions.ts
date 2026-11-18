"use server";

import { runAmapAction } from "./amap-action";
import {
  correctOrderQuantities,
  correctOrderQuantity,
  type CorrectionResult,
} from "./order-corrections";

// Actions de l'écran « Corriger la commande d'un foyer » (story D7). Chacune : contexte de
// l'AMAP de l'adresse, puis order-corrections.ts, qui vérifie le rôle (référent du producteur
// ou admin) et refait tous les contrôles de la case.

type Forbidden = { status: "forbidden" };
type Target = { householdId: string; amapProducerId: string };

/**
 * Page où revenir après une deuxième vérification : seul un admin la voit demander, et il
 * corrige depuis la fiche du foyer. Calculée ici, jamais reçue du navigateur.
 */
const adminPath = (amap: string, t: Target) =>
  `/${amap}/admin/foyers/${encodeURIComponent(t.householdId)}/commande/${encodeURIComponent(t.amapProducerId)}`;
type Line = { catalogItemId: string; distributionId: string; quantity: number };

/** Corrige la quantité d'un produit pour une distribution, enregistrée dès la saisie. */
export async function correctOrderQuantityAction(
  amap: string,
  target: Target,
  line: Line,
): Promise<CorrectionResult | Forbidden> {
  const outcome = await runAmapAction(amap, adminPath(amap, target), (tx, ctx) =>
    correctOrderQuantity(tx, ctx, { ...target, ...line }),
  );
  return "status" in outcome ? outcome : outcome.result;
}

/** « Même quantité chaque semaine » : toutes les cases d'un produit en une requête. */
export async function correctOrderQuantitiesAction(
  amap: string,
  target: Target,
  lines: Line[],
): Promise<CorrectionResult[] | { status: "invalid" } | Forbidden> {
  const outcome = await runAmapAction(amap, adminPath(amap, target), (tx, ctx) =>
    correctOrderQuantities(tx, ctx, { ...target, lines }),
  );
  return "status" in outcome ? outcome : outcome.result;
}
