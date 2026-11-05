/**
 * Limitation de débit en mémoire : au plus `limit` essais par clé (adresse IP, email…)
 * sur une fenêtre glissante de `windowMs` millisecondes.
 *
 * En mémoire du serveur : suffisant tant que Pomme tourne sur une seule instance (V1).
 * Avec plusieurs instances, il faudra un stockage partagé (base ou Redis).
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return {
    /** Enregistre un essai ; renvoie false si la limite est déjà atteinte (essai refusé). */
    consume(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      // Ménage de temps en temps, pour que la mémoire ne grossisse pas indéfiniment.
      if (hits.size > 10_000) {
        for (const [k, times] of hits) {
          if (times.every((time) => now - time >= windowMs)) hits.delete(k);
        }
      }
      return true;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
