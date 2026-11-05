import { createTranslator } from "next-intl";

import messages from "@/i18n/messages/fr.json";

import { escapeHtml } from "./escape-html";
import type { EmailContent } from "./mailer";

/**
 * Email contenant le lien de connexion. Version texte complète (lisible sans HTML ni image) et
 * version HTML simple. La mise en forme aux couleurs de l'AMAP viendra avec la fiche S5.
 */
export function magicLinkEmail(url: string, validityMinutes: number): EmailContent {
  const t = createTranslator({ locale: "fr", messages, namespace: "Email.magicLink" });
  const lines = [t("intro"), t("validity", { minutes: validityMinutes }), t("ignore")];
  return {
    subject: t("subject"),
    text: [t("greeting"), "", lines[0], "", url, "", lines[1], lines[2]].join("\n"),
    html: [
      `<p>${escapeHtml(t("greeting"))}</p>`,
      `<p>${escapeHtml(lines[0] ?? "")}</p>`,
      `<p><a href="${escapeHtml(url)}">${escapeHtml(t("button"))}</a></p>`,
      `<p>${escapeHtml(lines[1] ?? "")}<br>${escapeHtml(lines[2] ?? "")}</p>`,
    ].join("\n"),
  };
}
