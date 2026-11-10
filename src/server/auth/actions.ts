"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { user } from "@/db/schema";

import { CAPTCHA_FIELD, captchaConfig, verifyCaptcha } from "../captcha";
import { createRateLimiter } from "../rate-limit";

import { getAuthInstance } from "./auth";
import { clientIp } from "./client-ip";
import { RATE_LIMIT_FACTOR } from "../rate-limit-factor";
import { requestMagicLink, type RequestMagicLinkState } from "./request-magic-link";

// Par quart d'heure : 3 liens par adresse email et 10 demandes par adresse IP en production.
// Plus souple en développement et dans les tests de bout en bout (voir rate-limit-factor.ts).
const factor = RATE_LIMIT_FACTOR;
const emailLimiter = createRateLimiter({ limit: 3 * factor, windowMs: 15 * 60 * 1000 });
const ipLimiter = createRateLimiter({ limit: 10 * factor, windowMs: 15 * 60 * 1000 });

/** Formulaire « Recevoir un lien de connexion ». */
export async function requestMagicLinkAction(
  _previous: RequestMagicLinkState,
  formData: FormData,
): Promise<RequestMagicLinkState> {
  const requestHeaders = await headers();
  const { auth, db } = getAuthInstance();
  return requestMagicLink(
    { email: formData.get("email"), ip: clientIp(requestHeaders) },
    {
      verifyCaptcha: () => verifyCaptcha(formData.get(CAPTCHA_FIELD), captchaConfig()),
      emailLimiter,
      ipLimiter,
      userExists: async (email) => {
        const rows = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
        return rows.length > 0;
      },
      sendLink: async (email) => {
        await auth.api.signInMagicLink({
          body: {
            email,
            callbackURL: "/connexion/bienvenue",
            errorCallbackURL: "/connexion?erreur=lien",
          },
          headers: requestHeaders,
        });
      },
    },
  );
}

/** « Me déconnecter » : ferme la session de cet appareil. */
export async function signOutAction(): Promise<void> {
  await getAuthInstance().auth.api.signOut({ headers: await headers() });
  redirect("/connexion?deconnexion=1");
}

/** « Me déconnecter de tous mes appareils » : ferme toutes les sessions du compte. */
export async function signOutEverywhereAction(): Promise<void> {
  const requestHeaders = await headers();
  const { auth } = getAuthInstance();
  await auth.api.revokeSessions({ headers: requestHeaders });
  await auth.api.signOut({ headers: requestHeaders }).catch(() => {
    // La session de cet appareil vient d'être révoquée avec les autres : rien à fermer.
  });
  redirect("/connexion?deconnexion=tous");
}
