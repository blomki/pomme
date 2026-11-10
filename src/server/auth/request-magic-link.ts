import { z } from "zod";

import type { CaptchaVerdict } from "../captcha";
import type { RateLimiter } from "../rate-limit";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export type RequestMagicLinkState = {
  status: "idle" | "sent" | "invalid" | "rate_limited" | "captcha";
};

export type RequestMagicLinkDeps = {
  /** Vérifie la réponse du captcha envoyée avec le formulaire (voir server/captcha.ts). */
  verifyCaptcha: () => Promise<CaptchaVerdict>;
  emailLimiter: RateLimiter;
  ipLimiter: RateLimiter;
  userExists: (email: string) => Promise<boolean>;
  sendLink: (email: string) => Promise<void>;
};

/**
 * Demande d'un lien de connexion, sans dépendre de Next.js (pour pouvoir la tester).
 *
 * La réponse est la même que le compte existe ou non (« sent ») : un visiteur ne peut pas
 * savoir si une adresse est inscrite. Aucun email n'est envoyé à une adresse inconnue.
 * Limites : par adresse IP et par email (voir actions.ts).
 *
 * Le captcha est vérifié AVANT les limites : sinon un robot pourrait épuiser le quota de liens
 * d'une vraie personne en demandant des liens pour son adresse.
 */
export async function requestMagicLink(
  input: { email: unknown; ip: string },
  deps: RequestMagicLinkDeps,
): Promise<RequestMagicLinkState> {
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) return { status: "invalid" };
  const email = parsed.data;
  if ((await deps.verifyCaptcha()) !== "passed") return { status: "captcha" };
  if (!deps.ipLimiter.consume(input.ip) || !deps.emailLimiter.consume(email)) {
    return { status: "rate_limited" };
  }
  if (await deps.userExists(email)) await deps.sendLink(email);
  return { status: "sent" };
}
