import { createTranslator } from "next-intl";

import type { AmapTheme } from "@/db/schema";
import messages from "@/i18n/messages/fr.json";

import { renderEmail } from "./layout";
import type { EmailContent } from "./mailer";

/**
 * Email du planning des permanences (story G2) : à l'envoi du planning (« planning ») ou après
 * un changement (« change »), avec les dates de permanence de la personne.
 */
export function dutyPlanningEmail(params: {
  kind: "planning" | "change";
  amap: { name: string; theme: AmapTheme | null };
  firstName: string;
  /** Trimestre en toutes lettres (« janvier à mars 2027 »). */
  quarter: string;
  /** Dates de permanence, en toutes lettres (« jeudi 7 janvier »). */
  dates: string[];
  url: string;
}): EmailContent {
  const t = createTranslator({ locale: "fr", messages, namespace: "Email.dutyPlanning" });
  const values = { amap: params.amap.name, quarter: params.quarter, count: params.dates.length };
  return renderEmail(
    { name: params.amap.name, theme: params.amap.theme },
    {
      subject: t(`${params.kind}Subject`, values),
      preview: t("preview", values),
      greeting: t("greeting", { firstName: params.firstName }),
      paragraphs: [
        t(`${params.kind}Intro`, values),
        // Une date par paragraphe : le HTML ne garde pas les retours à la ligne.
        ...(params.dates.length > 0 ? params.dates.map((d) => `• ${d}`) : [t("none")]),
        t("swap"),
      ],
      action: { label: t("button"), url: params.url },
      notes: [],
      footer: t("footer", values),
    },
  );
}
