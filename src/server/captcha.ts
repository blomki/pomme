/**
 * Friendly Captcha (v2) : protège les formulaires publics (connexion, « Nous rejoindre ») contre
 * les robots, sans cookie ni pistage (voir ADR 0007).
 *
 * Le navigateur résout un petit calcul dans le widget, qui place sa réponse dans le champ caché
 * `frc-captcha-response` du formulaire. Le serveur la fait vérifier par l'API de Friendly
 * Captcha avant de traiter la demande.
 */

export type CaptchaConfig = {
  /** Clé publique du site (commence par « FC »), affichée dans la page. */
  sitekey: string;
  /** Clé secrète d'API, côté serveur seulement. */
  apiKey: string;
  /** Point d'accès : "eu" (traitement dans l'UE, offre payante) ou "global". */
  endpoint: "eu" | "global";
};

/** Nom du champ caché ajouté au formulaire par le widget. */
export const CAPTCHA_FIELD = "frc-captcha-response";

type Env = Record<string, string | undefined>;

/**
 * Configuration du captcha, ou null s'il est désactivé.
 *
 * - En développement et dans les tests : désactivé si les clés manquent.
 * - En production : clés obligatoires. Seule exception, CAPTCHA_DISABLED=1, réservé à la CI
 *   (build de production sans clés) : jamais sur un serveur accessible au public.
 */
export function captchaConfig(env: Env = process.env): CaptchaConfig | null {
  if (env.CAPTCHA_DISABLED === "1") return null;
  const sitekey = env.FRIENDLY_CAPTCHA_SITEKEY;
  const apiKey = env.FRIENDLY_CAPTCHA_API_KEY;
  if (!sitekey || !apiKey) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "FRIENDLY_CAPTCHA_SITEKEY et FRIENDLY_CAPTCHA_API_KEY sont obligatoires en production " +
          "(voir .env.example).",
      );
    }
    return null;
  }
  return { sitekey, apiKey, endpoint: env.FRIENDLY_CAPTCHA_ENDPOINT === "eu" ? "eu" : "global" };
}

export type CaptchaVerdict = "passed" | "missing" | "rejected";

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Vérifie la réponse du widget auprès de Friendly Captcha.
 *
 * - "passed" : vérifiée (ou captcha désactivé) ;
 * - "missing" : pas de réponse (calcul pas terminé, ou robot qui n'a pas chargé le widget) ;
 * - "rejected" : réponse refusée (fausse, expirée ou déjà utilisée).
 *
 * Si l'API de Friendly Captcha ne répond pas (panne, délai dépassé), la demande est acceptée,
 * comme le recommande l'éditeur : une panne chez lui ne doit pas empêcher les familles de se
 * connecter. Les limites de débit restent en place, et l'incident est journalisé.
 */
export async function verifyCaptcha(
  response: unknown,
  config: CaptchaConfig | null,
  fetchFn: FetchFn = fetch,
): Promise<CaptchaVerdict> {
  if (!config) return "passed";
  if (typeof response !== "string" || response.length === 0) return "missing";

  try {
    const result = await fetchFn(
      `https://${config.endpoint}.frcapi.com/api/v2/captcha/siteverify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
        body: JSON.stringify({ response, sitekey: config.sitekey }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!result.ok) {
      // Erreur de configuration (clé d'API fausse…) ou panne chez Friendly Captcha : ce n'est
      // pas un refus. À surveiller dans les journaux (une clé fausse désactiverait le captcha).
      console.error(`Friendly Captcha : réponse HTTP ${result.status}, demande acceptée.`);
      return "passed";
    }
    const body = (await result.json()) as { success?: boolean };
    return body.success ? "passed" : "rejected";
  } catch (error) {
    console.error("Friendly Captcha injoignable, demande acceptée :", error);
    return "passed";
  }
}
