import { createTranslator } from "next-intl";

import messages from "@/i18n/messages/fr.json";

import { PLATFORM_BRAND, renderEmail } from "./layout";
import type { EmailContent } from "./mailer";

/**
 * Alerte de connexion depuis un nouvel appareil (story S10, ADR 0041), aux couleurs de Pomme.
 * Le bouton mène à une page qui demande confirmation avant de déconnecter tous les appareils :
 * un lien d'email ne doit jamais agir à lui seul (les messageries ouvrent parfois les liens).
 */
export function newDeviceEmail(params: {
  firstName: string;
  device: string;
  when: string;
  revokeUrl: string;
}): EmailContent {
  const t = createTranslator({ locale: "fr", messages, namespace: "Email.newDevice" });
  return renderEmail(PLATFORM_BRAND, {
    subject: t("subject"),
    preview: t("preview", { device: params.device }),
    greeting: t("greeting", { firstName: params.firstName }),
    paragraphs: [t("intro", { device: params.device, when: params.when }), t("ifYou"), t("ifNot")],
    action: { label: t("button"), url: params.revokeUrl },
    notes: [t("validity")],
    footer: t("footer"),
  });
}
