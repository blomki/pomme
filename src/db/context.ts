import { sql } from "drizzle-orm";

import type { Database, Transaction } from "./client";

/** Qui agit, et dans quelle AMAP. */
export type AmapContext = {
  /** AMAP où l'utilisateur navigue ([domaine]/hommesdeterre…) ; null hors d'une AMAP. */
  amapId: string | null;
  /** Utilisateur connecté ; null pour un visiteur. */
  userId: string | null;
  /**
   * Deuxième vérification faite sur la session (passkey ou code). Exigée par requireRole pour
   * les actions réservées aux admins. Absent = non.
   */
  secondFactorVerified?: boolean;
};

/**
 * Ouvre une transaction dans laquelle PostgreSQL connaît l'AMAP et l'utilisateur courants.
 *
 * Pourquoi : les politiques de Row Level Security lisent ces deux variables
 * (app.amap_id et app.user_id) pour filtrer chaque requête. Le troisième argument « true »
 * de set_config limite leur durée à la transaction : une connexion réutilisée ensuite par
 * une autre requête ne garde rien.
 *
 * Toute lecture ou écriture de données d'une AMAP passe par cette fonction.
 *
 * @example
 * await withAmapContext(getDatabase(), { amapId, userId }, async (tx, ctx) => {
 *   await requireRole(tx, ctx, ["admin"]);
 *   // … lire et écrire avec tx …
 *   await writeAuditLog(tx, ctx, { entityType: "amap", entityId: amapId, action: "update" });
 * });
 */
export async function withAmapContext<T>(
  db: Database,
  ctx: AmapContext,
  fn: (tx: Transaction, ctx: AmapContext) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.amap_id', ${ctx.amapId ?? ""}, true),
                 set_config('app.user_id', ${ctx.userId ?? ""}, true)`,
    );
    return fn(tx, ctx);
  });
}
