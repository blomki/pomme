import { createTranslator } from "next-intl";

import messages from "@/i18n/messages/fr.json";

import { PLATFORM_BRAND, renderEmail } from "./layout";
import type { EmailContent } from "./mailer";

/** Email contenant le lien de connexion, aux couleurs de Pomme (il ne dépend d'aucune AMAP). */
export function magicLinkEmail(url: string, validityMinutes: number): EmailContent {
  const t = createTranslator({ locale: "fr", messages, namespace: "Email.magicLink" });
  return renderEmail(PLATFORM_BRAND, {
    subject: t("subject"),
    preview: t("preview", { minutes: validityMinutes }),
    greeting: t("greeting"),
    paragraphs: [t("intro")],
    action: { label: t("button"), url },
    notes: [t("validity", { minutes: validityMinutes }), t("ignore")],
    footer: t("footer"),
  });
}
