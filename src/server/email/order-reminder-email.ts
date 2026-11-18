import { createTranslator } from "next-intl";

import type { AmapTheme } from "@/db/schema";
import messages from "@/i18n/messages/fr.json";

import { renderEmail } from "./layout";
import type { EmailContent } from "./mailer";

/**
 * Relance d'un foyer qui n'a encore rien commandé pour le mois (story D2), aux couleurs de
 * l'AMAP. Comme l'invitation, pas de lien de connexion : le bouton mène à l'espace famille, qui
 * demande de se connecter si besoin.
 */
export function orderReminderEmail(params: {
  amap: { name: string; theme: AmapTheme | null };
  firstName: string;
  /** Mois commandé, en toutes lettres (« décembre »). */
  month: string;
  /** Dernier jour pour commander (« mercredi 25 novembre »). */
  closesOn: string;
  orderUrl: string;
}): EmailContent {
  const t = createTranslator({ locale: "fr", messages, namespace: "Email.orderReminder" });
  const values = { amap: params.amap.name, month: params.month, closesOn: params.closesOn };
  return renderEmail(
    { name: params.amap.name, theme: params.amap.theme },
    {
      subject: t("subject", values),
      preview: t("preview", values),
      greeting: t("greeting", { firstName: params.firstName }),
      paragraphs: [t("intro", values), t("nothing")],
      action: { label: t("button"), url: params.orderUrl },
      notes: [],
      footer: t("footer", values),
    },
  );
}
