import nodemailer, { type Transporter } from "nodemailer";

export type EmailContent = { subject: string; text: string; html: string };

/** Ce qui envoie vraiment l'email ; remplacé par un faux dans les tests. */
export type EmailTransport = {
  /** Envoie l'email ; renvoie l'identifiant du message chez le fournisseur. */
  send(to: string, content: EmailContent): Promise<{ providerId: string }>;
};

let transporter: Transporter | undefined;

/**
 * Envoi par SMTP (SMTP_URL) : relais SMTP de Brevo en production, Mailpit en local
 * (http://localhost:8025), qui capte tout sans rien envoyer. Voir ADR 0006.
 */
export const smtpTransport: EmailTransport = {
  async send(to, content) {
    const url = process.env.SMTP_URL;
    if (!url) throw new Error("SMTP_URL n'est pas défini (voir .env.example).");
    transporter ??= nodemailer.createTransport(url);
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM ?? "Pomme <ne-pas-repondre@example.org>",
      to,
      ...content,
    });
    return { providerId: info.messageId };
  },
};
