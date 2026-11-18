import { createTranslator } from "next-intl";

import type { AmapTheme } from "@/db/schema";
import { formatEuros } from "@/domain/catalog";
import type { OrderForm } from "@/domain/order-forms";
import { formatDate } from "@/i18n/dates";
import messages from "@/i18n/messages/fr.json";

import { renderEmail } from "./layout";
import type { EmailContent } from "./mailer";

/**
 * Bon de commande envoyé au producteur (story E1) : ce qu'il prépare pour chaque distribution,
 * et un lien signé vers la version à imprimer (détail par foyer), valable sans connexion.
 */
export function orderFormEmail(params: {
  amap: { name: string; theme: AmapTheme | null };
  producer: string;
  /** Mois en toutes lettres (« décembre »). */
  month: string;
  form: OrderForm;
  printUrl: string;
  validUntil: Date;
}): EmailContent {
  const t = createTranslator({ locale: "fr", messages, namespace: "Email.orderForm" });
  const total = formatEuros(params.form.totalCents);
  const values = { amap: params.amap.name, month: params.month, producer: params.producer, total };
  const weeks = params.form.distributions
    .map((d, index) => {
      const items = params.form.products
        .filter((p) => p.perDistribution[index]! > 0)
        .map((p) => t("item", { quantity: p.perDistribution[index]!, product: p.name }));
      return items.length
        ? t("week", {
            date: formatDate(`${d.date}T12:00:00Z`, "EEEE d MMMM"),
            items: items.join(", "),
          })
        : null;
    })
    .filter((line): line is string => line !== null);
  return renderEmail(
    { name: params.amap.name, theme: params.amap.theme },
    {
      subject: t("subject", values),
      preview: t("preview", { ...values, count: weeks.length }),
      greeting: t("greeting"),
      paragraphs: [t("intro", values), t("weeks"), ...weeks],
      action: { label: t("button"), url: params.printUrl },
      notes: [t("validity", { date: formatDate(params.validUntil, "d MMMM yyyy") })],
      footer: t("footer", values),
    },
  );
}
