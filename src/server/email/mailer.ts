import nodemailer, { type Transporter } from "nodemailer";

export type EmailContent = { subject: string; text: string; html: string };

let transporter: Transporter | undefined;

/**
 * Envoie un email par SMTP (SMTP_URL). En local, Mailpit capte tout (http://localhost:8025) ;
 * en production, le relais SMTP de Brevo (fiche S5, qui ajoutera aussi le journal des envois).
 */
export async function sendEmail(to: string, content: EmailContent): Promise<void> {
  const url = process.env.SMTP_URL;
  if (!url) throw new Error("SMTP_URL n'est pas défini (voir .env.example).");
  transporter ??= nodemailer.createTransport(url);
  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? "Pomme <ne-pas-repondre@example.org>",
    to,
    ...content,
  });
}
