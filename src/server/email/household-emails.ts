import { createTranslator } from "next-intl";

import type { AmapTheme } from "@/db/schema";
import messages from "@/i18n/messages/fr.json";

import { renderEmail } from "./layout";
import type { EmailContent } from "./mailer";

type Amap = { name: string; theme: AmapTheme | null };

/**
 * Invitation dans un foyer (story A3) : un membre invite une personne ; le bouton mène à la page
 * « Rejoindre le foyer ». Lien valable 7 jours, à usage unique.
 */
export function householdInvitationEmail(params: {
  amap: Amap;
  inviterName: string;
  householdName: string;
  url: string;
}): EmailContent {
  const t = createTranslator({ locale: "fr", messages, namespace: "Email.householdInvitation" });
  const values = {
    amap: params.amap.name,
    inviter: params.inviterName,
    household: params.householdName,
  };
  return renderEmail(params.amap, {
    subject: t("subject", values),
    preview: t("preview", values),
    greeting: t("greeting"),
    paragraphs: [t("intro", values), t("explain")],
    action: { label: t("button"), url: params.url },
    notes: [t("expiry"), t("ignore")],
    footer: t("footer", values),
  });
}

/** Un membre a été retiré de son foyer (story A3) : il en est informé ; son compte reste. */
export function memberRemovedEmail(params: {
  amap: Amap;
  firstName: string;
  householdName: string;
  removedBy: string;
}): EmailContent {
  const t = createTranslator({ locale: "fr", messages, namespace: "Email.memberRemoved" });
  const values = {
    amap: params.amap.name,
    household: params.householdName,
    by: params.removedBy,
  };
  return renderEmail(params.amap, {
    subject: t("subject", values),
    preview: t("preview", values),
    greeting: t("greeting", { firstName: params.firstName || "" }),
    paragraphs: [t("intro", values), t("account")],
    notes: [],
    footer: t("footer", values),
  });
}
