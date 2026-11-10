import type { AmapTheme } from "@/db/schema";
import { createM3Schemes } from "@/ui/theme/m3-colors";
import { PLATFORM_THEME, resolveThemeConfig } from "@/ui/theme/key-colors";

import { escapeHtml } from "./escape-html";
import type { EmailContent } from "./mailer";

/** Expéditeur affiché dans l'email : la plateforme Pomme, ou une AMAP avec ses couleurs. */
export type EmailBrand = { name: string; theme: AmapTheme | null };

export const PLATFORM_BRAND: EmailBrand = { name: "Pomme", theme: null };

export type EmailBody = {
  subject: string;
  /** Texte d'aperçu montré par la messagerie à côté de l'objet. */
  preview?: string;
  greeting: string;
  paragraphs: string[];
  /** Bouton principal (lien), recopié en clair dans la version texte. */
  action?: { label: string; url: string };
  /** Petites lignes sous le bouton (validité, « ignorez cet email si… »). */
  notes?: string[];
  /** Pied de page (pourquoi cet email, qui l'envoie). */
  footer: string;
};

/** Couleurs de l'email, en clair : la plupart des messageries n'appliquent pas le mode sombre. */
function emailColors(brand: EmailBrand) {
  const config = brand.theme ? resolveThemeConfig(brand.theme) : PLATFORM_THEME;
  const { light } = createM3Schemes(config.keyColors);
  return {
    background: light.surfaceContainer,
    card: light.surface,
    text: light.onSurface,
    muted: light.onSurfaceVariant,
    header: light.primary,
    onHeader: light.onPrimary,
    button: light.primary,
    onButton: light.onPrimary,
    outline: light.outlineVariant,
  };
}

const FONT = "Calibri, Carlito, Arial, Helvetica, sans-serif";

/**
 * Met un email en forme : version texte complète (lisible partout, sans HTML ni image) et
 * version HTML simple aux couleurs de l'AMAP.
 *
 * Pourquoi des tableaux et des styles « en ligne » : beaucoup de messageries (Outlook, Gmail)
 * ignorent les feuilles de style et la mise en page moderne. Aucune image : l'email reste
 * complet même quand les images sont bloquées. Les couleurs sont des rôles Material Design 3
 * (primary / onPrimary…), dont le contraste est garanti quelle que soit la couleur choisie.
 */
export function renderEmail(brand: EmailBrand, body: EmailBody): EmailContent {
  const c = emailColors(brand);
  const e = escapeHtml;

  const text = [
    body.greeting,
    "",
    ...body.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(body.action ? [`${body.action.label} :`, body.action.url, ""] : []),
    ...(body.notes ?? []),
    ...(body.notes?.length ? [""] : []),
    "--",
    `${brand.name} · ${body.footer}`,
  ].join("\n");

  const paragraph = (content: string, color = c.text, size = 16, extra = "") =>
    `<p style="margin:0 0 16px;font-family:${FONT};font-size:${size}px;line-height:1.5;color:${color};${extra}">${content}</p>`;

  const button = body.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>
<td style="border-radius:20px;background:${c.button};">
<a href="${e(body.action.url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:16px;font-weight:bold;color:${c.onButton};text-decoration:none;border-radius:20px;">${e(body.action.label)}</a>
</td></tr></table>
${paragraph(e(body.action.url), c.muted, 13, "word-break:break-all;")}`
    : "";

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${e(body.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${c.background};">
${body.preview ? `<div style="display:none;max-height:0;overflow:hidden;">${e(body.preview)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.background};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${c.card};border-radius:16px;border:1px solid ${c.outline};">
<tr><td style="padding:16px 24px;background:${c.header};border-radius:16px 16px 0 0;">
<p style="margin:0;font-family:${FONT};font-size:20px;font-weight:bold;color:${c.onHeader};">${e(brand.name)}</p>
</td></tr>
<tr><td style="padding:24px;">
${paragraph(e(body.greeting))}
${body.paragraphs.map((p) => paragraph(e(p))).join("\n")}
${button}
${(body.notes ?? []).map((note) => paragraph(e(note), c.muted, 14)).join("\n")}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${c.outline};">
${paragraph(`${e(brand.name)} · ${e(body.footer)}`, c.muted, 13)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject: body.subject, text, html };
}
