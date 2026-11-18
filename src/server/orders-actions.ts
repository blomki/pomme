"use server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { dedupeKey } from "@/domain/notifications";
import { formatDate } from "@/i18n/dates";

import { getAmapBySlug } from "./amap";
import { runAmapAction } from "./amap-action";
import { getCurrentSession } from "./auth/session";
import { orderConfirmationEmail } from "./email/order-confirmation-email";
import { sendNotification } from "./email/notify";
import {
  planOrderConfirmation,
  setNothingThisMonth,
  setOrderQuantities,
  setOrderQuantity,
  type DeclineResult,
  type OrderRefusal,
  type SetQuantityResult,
} from "./orders";

// Actions des écrans « Commande du mois » de la famille (story D3). Chacune : contexte de
// l'AMAP de l'adresse, puis fonction de orders.ts, qui retrouve le foyer du compte connecté et
// refait tous les contrôles.

type Forbidden = { status: "forbidden" };
const orderPath = (amap: string) => `/${amap}/famille/commande`;

/** Quantité d'un produit pour une distribution, enregistrée dès la saisie. */
export async function setOrderQuantityAction(
  amap: string,
  input: { catalogItemId: string; distributionId: string; quantity: number },
): Promise<SetQuantityResult | Forbidden> {
  const outcome = await runAmapAction(amap, orderPath(amap), (tx, ctx) =>
    setOrderQuantity(tx, ctx, input),
  );
  // Pas de revalidatePath : la saisie est fréquente, et les pages de commande se relisent à
  // chaque visite (pages dynamiques). L'écran met lui-même ses totaux à jour.
  return "status" in outcome ? outcome : outcome.result;
}

/** « Même quantité chaque semaine » : toutes les cases d'un produit en une requête. */
export async function setOrderQuantitiesAction(
  amap: string,
  lines: Array<{ catalogItemId: string; distributionId: string; quantity: number }>,
): Promise<SetQuantityResult[] | { status: "invalid" } | Forbidden> {
  const outcome = await runAmapAction(amap, orderPath(amap), (tx, ctx) =>
    setOrderQuantities(tx, ctx, { lines }),
  );
  return "status" in outcome ? outcome : outcome.result;
}

/** « Rien ce mois-ci » chez un producteur, ou son annulation. */
export async function setNothingThisMonthAction(
  amap: string,
  input: { catalogId: string; nothing: boolean },
): Promise<DeclineResult | Forbidden> {
  const outcome = await runAmapAction(amap, orderPath(amap), (tx, ctx) =>
    setNothingThisMonth(tx, ctx, input),
  );
  return "status" in outcome ? outcome : outcome.result;
}

export type ConfirmResult =
  { status: "confirmed"; emailed: boolean } | { status: "empty" } | OrderRefusal | Forbidden;

/**
 * « Valider ma commande » : aucun statut enregistré, la commande compte dès la première
 * quantité. Envoie l'email récapitulatif à la personne qui valide, une fois par mois (clé de
 * dédoublonnage) : une deuxième validation n'en renvoie pas.
 */
export async function confirmOrderAction(amap: string): Promise<ConfirmResult> {
  const outcome = await runAmapAction(amap, orderPath(amap), async (tx, ctx) => ({
    plan: await planOrderConfirmation(tx, ctx),
    ctx,
  }));
  if ("status" in outcome) return outcome;
  const { plan, ctx } = outcome.result;
  if (plan.status !== "ready") return plan;

  const amapRow = await getAmapBySlug(amap);
  const session = await getCurrentSession();
  if (!session || !ctx.userId) return { status: "confirmed", emailed: false };
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const result = await withAmapContext(getDatabase(), ctx, (tx) =>
    sendNotification(tx, {
      amapId: ctx.amapId,
      userId: ctx.userId,
      template: "order_confirmation",
      dedupeKey: dedupeKey("order_confirmation", ctx.userId!, plan.periodId),
      to: session.user.email,
      content: orderConfirmationEmail({
        amap: { name: amapRow?.name ?? "", theme: amapRow?.theme ?? null },
        // Better Auth range le prénom dans « name » (colonne first_name, voir auth.ts).
        firstName: session.user.name,
        month: formatDate(`${plan.month}-01T12:00:00Z`, "MMMM"),
        closesOn: formatDate(`${plan.closesOn}T12:00:00Z`, "EEEE d MMMM"),
        producers: plan.producers,
        totalCents: plan.totalCents,
        orderUrl: new URL(`${orderPath(amap)}/recapitulatif`, baseUrl).toString(),
      }),
    }),
  );
  return { status: "confirmed", emailed: result.status === "sent" };
}
