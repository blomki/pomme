import { createTranslator } from "next-intl";

import type { AmapTheme } from "@/db/schema";
import { formatEuros } from "@/domain/catalog";
import messages from "@/i18n/messages/fr.json";

import { renderEmail } from "./layout";
import type { EmailContent } from "./mailer";

/**
 * Récapitulatif envoyé quand la famille valide sa commande (story D3) : un chèque par
 * producteur, avec son ordre, et le total provisoire. Pas de lien de connexion : le bouton
 * mène au récapitulatif, qui demande de se connecter si besoin.
 */
export function orderConfirmationEmail(params: {
  amap: { name: string; theme: AmapTheme | null };
  firstName: string;
  /** Mois commandé, en toutes lettres (« décembre »). */
  month: string;
  /** Dernier jour pour modifier (« mercredi 25 novembre »). */
  closesOn: string;
  producers: ReadonlyArray<{ name: string; checkPayee: string; totalCents: number }>;
  totalCents: number;
  orderUrl: string;
}): EmailContent {
  const t = createTranslator({ locale: "fr", messages, namespace: "Email.orderConfirmation" });
  const total = formatEuros(params.totalCents);
  const values = { amap: params.amap.name, month: params.month, closesOn: params.closesOn };
  return renderEmail(
    { name: params.amap.name, theme: params.amap.theme },
    {
      subject: t("subject", values),
      preview: t("preview", { count: params.producers.length, total }),
      greeting: t("greeting", { firstName: params.firstName }),
      paragraphs: [
        t("intro", values),
        t("cheques"),
        ...params.producers.map((p) => {
          const amount = formatEuros(p.totalCents);
          return p.checkPayee
            ? t("cheque", { producer: p.name, amount, payee: p.checkPayee })
            : t("chequeNoPayee", { producer: p.name, amount });
        }),
        t("total", { total }),
      ],
      action: { label: t("button"), url: params.orderUrl },
      notes: [],
      footer: t("footer", values),
    },
  );
}
