/**
 * Générateur pseudo-aléatoire « mulberry32 » : à graine égale, mêmes nombres, dans le même
 * ordre. Le jeu de données fictif est ainsi identique à chaque chargement (mêmes noms, mêmes
 * identifiants), ce qui rend les tests et les captures d'écran reproductibles.
 * Ne jamais l'utiliser pour de la sécurité (jetons, mots de passe…).
 */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Nombre entre 0 (inclus) et 1 (exclu). */
    next,
    /** Élément au hasard d'une liste non vide. */
    pick<T>(items: readonly T[]): T {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error("Liste vide.");
      return item;
    },
    /** Octets pseudo-aléatoires (pour des UUID reproductibles). */
    bytes(size: number): Uint8Array {
      return Uint8Array.from({ length: size }, () => Math.floor(next() * 256));
    },
  };
}
