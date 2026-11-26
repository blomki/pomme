import { eq } from "drizzle-orm";

import { passkey } from "@/db/schema";

import { getAuthInstance } from "./auth";

/**
 * Date de dernière connexion de chaque passkey du compte (story A3), par identifiant. Table de
 * Better Auth : lue avec sa connexion (rôle pomme_auth), pour le seul compte connecté.
 */
export async function passkeyLastUse(userId: string): Promise<Record<string, string | null>> {
  const rows = await getAuthInstance()
    .db.select({ id: passkey.id, lastUsedAt: passkey.lastUsedAt })
    .from(passkey)
    .where(eq(passkey.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.id, r.lastUsedAt?.toISOString() ?? null]));
}
