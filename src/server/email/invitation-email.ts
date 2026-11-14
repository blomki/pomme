import { createTranslator } from "next-intl";

import type { AmapTheme } from "@/db/schema";
import messages from "@/i18n/messages/fr.json";

import { renderEmail } from "./layout";
import type { EmailContent } from "./mailer";

/**
 * Email d'invitation dans un foyer (story A2), aux couleurs de l'AMAP.
 *
 * Il ne contient PAS de lien de connexion : une invitation peut être ouverte des jours plus
 * tard, alors qu'un lien de connexion ne vaut que 15 minutes. Le bouton mène à la page de
 * connexion, adresse déjà remplie : un clic y envoie un lien de connexion frais. Ainsi, aucun
 * accès durable au compte ne dort dans une boîte mail.
 */
export function invitationEmail(params: {
  amap: { name: string; theme: AmapTheme | null };
  firstName: string;
  loginUrl: string;
}): EmailContent {
  const t = createTranslator({ locale: "fr", messages, namespace: "Email.invitation" });
  const amapName = params.amap.name;
  return renderEmail(
    { name: amapName, theme: params.amap.theme },
    {
      subject: t("subject", { amap: amapName }),
      preview: t("preview", { amap: amapName }),
      greeting: t("greeting", { firstName: params.firstName }),
      paragraphs: [t("intro", { amap: amapName }), t("how")],
      action: { label: t("button"), url: params.loginUrl },
      notes: [t("noPassword")],
      footer: t("footer", { amap: amapName }),
    },
  );
}

/** Adresse de la page de connexion, avec l'email déjà rempli. */
export function invitationLoginUrl(baseUrl: string, email: string): string {
  const url = new URL("/connexion", baseUrl);
  url.searchParams.set("email", email);
  return url.toString();
}
