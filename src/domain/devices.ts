/**
 * Appareils connus d'un compte (story S10, ADR 0041) : à chaque connexion depuis un appareil
 * jamais vu, un email prévient la personne, avec un lien pour déconnecter tous ses appareils.
 * Un appareil est reconnu par un cookie tiré au hasard (pas d'empreinte du navigateur).
 */

/** Nom du cookie qui identifie l'appareil (posé par src/proxy.ts). */
export const DEVICE_COOKIE = "pomme_appareil";

/** Valeur acceptée pour ce cookie : 22 à 64 caractères base64url. */
export function isDeviceId(value: string | undefined): value is string {
  return value !== undefined && /^[A-Za-z0-9_-]{22,64}$/.test(value);
}

/**
 * Description lisible de l'appareil, d'après l'en-tête User-Agent : « Firefox sur Windows ».
 * Approximative (l'en-tête se falsifie) : seulement pour aider la personne à se reconnaître.
 *
 * @example describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0") // "Firefox sur Windows"
 */
export function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Navigateur inconnu";
  const system = /iPhone|iPad/.test(ua)
    ? "iPhone ou iPad"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return system ? `${browser} sur ${system}` : browser;
}

/** Alerte à envoyer : appareil inconnu, et ce n'est pas le tout premier appareil du compte. */
export function shouldAlert(input: { known: boolean; otherDevices: number }): boolean {
  return !input.known && input.otherDevices > 0;
}
