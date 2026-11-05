import type { Database } from "../client";
import { amap, amapRole, auditLog, user } from "../schema";

import { buildSeedData } from "./data";

/**
 * Refuse de charger le jeu de données ailleurs que sur un poste de développement :
 * le chargement commence par TOUT effacer.
 */
export function assertSeedAllowed(databaseUrl: string, env: Record<string, string | undefined>) {
  if (env.NODE_ENV === "production") {
    throw new Error("Chargement du jeu de données interdit en production.");
  }
  const host = new URL(databaseUrl).hostname;
  const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  if (!isLocal && env.SEED_ALLOW_REMOTE !== "1") {
    throw new Error(
      `Base distante (${host}) : chargement refusé. ` +
        "Mettre SEED_ALLOW_REMOTE=1 seulement pour une base jetable (prévisualisation).",
    );
  }
}

/**
 * Efface les données puis charge le jeu fictif, en une seule transaction (tout ou rien).
 * Se connecte avec le rôle propriétaire : la RLS ne s'applique pas, ce qui permet d'écrire
 * dans toutes les AMAP.
 */
export async function seedDatabase(db: Database) {
  const data = buildSeedData();
  await db.transaction(async (tx) => {
    // Ordre inverse des dépendances (clés étrangères).
    await tx.delete(auditLog);
    await tx.delete(amapRole);
    await tx.delete(amap);
    await tx.delete(user);

    await tx.insert(user).values(data.users);
    await tx.insert(amap).values(data.amaps);
    await tx.insert(amapRole).values(data.roles);
  });
  return { amaps: data.amaps.length, users: data.users.length, roles: data.roles.length };
}
