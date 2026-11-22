import { createTranslator } from "next-intl";

import type { AmapTheme } from "@/db/schema";
import messages from "@/i18n/messages/fr.json";

import { renderEmail } from "./layout";
import type { EmailContent } from "./mailer";

/**
 * Email « Vos disponibilités du trimestre » (story G1) : à l'ouverture de la période de réponse
 * (« opening ») ou en relance (« reminder »). Le bouton mène à « Mes disponibilités », qui
 * demande de se connecter si besoin.
 */
export function dutyEmail(params: {
  kind: "opening" | "reminder";
  amap: { name: string; theme: AmapTheme | null };
  firstName: string;
  /** Trimestre en toutes lettres (« janvier à mars 2027 »). */
  quarter: string;
  /** Date limite (« dimanche 13 décembre »). */
  deadline: string;
  distributionCount: number;
  url: string;
}): EmailContent {
  const t = createTranslator({ locale: "fr", messages, namespace: "Email.duty" });
  const values = {
    amap: params.amap.name,
    quarter: params.quarter,
    deadline: params.deadline,
    count: params.distributionCount,
  };
  return renderEmail(
    { name: params.amap.name, theme: params.amap.theme },
    {
      subject: t(`${params.kind}Subject`, values),
      preview: t("preview", values),
      greeting: t("greeting", { firstName: params.firstName }),
      paragraphs: [t(`${params.kind}Intro`, values), t("howTo"), t("default")],
      action: { label: t("button"), url: params.url },
      notes: [],
      footer: t("footer", values),
    },
  );
}
