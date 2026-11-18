"use server";

import { getDatabase } from "@/db/client";
import { withAmapContext } from "@/db/context";
import { formatDate } from "@/i18n/dates";

import { getAmapBySlug } from "./amap";
import { runAmapAction } from "./amap-action";
import { orderFormEmail } from "./email/order-form-email";
import { sendNotification } from "./email/notify";
import { linkExpiry, signOrderFormLink } from "./order-form-link";
import { getOrderForm, producerEmail } from "./order-forms";

// Action de l'écran « Bons de commande » du référent (story E1).

export type SendOrderFormResult =
  | { status: "sent"; email: string }
  | { status: "failed" }
  | { status: "no_email" }
  | { status: "not_closed" }
  | { status: "forbidden" };

/**
 * « Envoyer à [producteur] par email » : seulement après la clôture. L'email contient ce qu'il
 * y a à préparer et un lien signé vers la version à imprimer (ADR 0019). Pas de dédoublonnage :
 * le référent peut renvoyer après une correction ; la limitation de débit protège des abus.
 */
export async function sendOrderFormAction(
  amap: string,
  input: { amapProducerId: string; month: string },
): Promise<SendOrderFormResult> {
  const outcome = await runAmapAction(
    amap,
    `/${amap}/referent/bons-de-commande`,
    async (tx, ctx) => ({
      view: await getOrderForm(tx, ctx, input),
      email: await producerEmail(tx, input.amapProducerId),
      ctx,
    }),
  );
  if ("status" in outcome) return outcome;
  const { view, email, ctx } = outcome.result;
  if (!view) return { status: "forbidden" };
  if (view.period?.status !== "closed") return { status: "not_closed" };
  if (!email) return { status: "no_email" };

  const amapRow = await getAmapBySlug(amap);
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const token = signOrderFormLink({ amapProducerId: view.amapProducerId, month: view.month });
  const printUrl = new URL(
    `/${amap}/bon-de-commande/${view.amapProducerId}/${view.month}?cle=${token}`,
    baseUrl,
  ).toString();
  const result = await withAmapContext(getDatabase(), ctx, (tx) =>
    sendNotification(tx, {
      amapId: ctx.amapId,
      userId: null,
      template: "order_form",
      to: email,
      content: orderFormEmail({
        amap: { name: amapRow?.name ?? "", theme: amapRow?.theme ?? null },
        producer: view.producerName,
        month: formatDate(`${view.month}-01T12:00:00Z`, "MMMM"),
        form: view.form,
        printUrl,
        validUntil: linkExpiry(token)!,
      }),
    }),
  );
  return result.status === "sent" ? { status: "sent", email } : { status: "failed" };
}
