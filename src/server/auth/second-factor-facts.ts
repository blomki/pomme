import { and, count, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { amapRole, passkey, session, twoFactor, user } from "@/db/schema";
import { requiresSecondFactor, type SecondFactorFacts } from "@/domain/second-factor";

export type AccountFactors = {
  /** Gestionnaire de la plateforme. */
  isPlatformAdmin: boolean;
  /** Le compte est soumis à la deuxième vérification (admin ou gestionnaire). */
  required: boolean;
  passkeys: number;
  /** Application d'authentification activée (premier code saisi). */
  totp: boolean;
};

/**
 * Ce qu'il faut savoir d'un compte pour la deuxième vérification.
 * À appeler avec la connexion de Better Auth (rôle pomme_auth) : elle seule lit les passkeys,
 * les secrets TOTP et les rôles de toutes les AMAP.
 */
export async function loadAccountFactors(db: Database, userId: string): Promise<AccountFactors> {
  const [account] = await db
    .select({ isPlatformAdmin: user.isPlatformAdmin })
    .from(user)
    .where(eq(user.id, userId));
  const roles = await db
    .select({ role: amapRole.role })
    .from(amapRole)
    .where(eq(amapRole.userId, userId));
  const [keys] = await db.select({ n: count() }).from(passkey).where(eq(passkey.userId, userId));
  const [totp] = await db
    .select({ n: count() })
    .from(twoFactor)
    .where(and(eq(twoFactor.userId, userId), eq(twoFactor.verified, true)));
  return {
    isPlatformAdmin: account?.isPlatformAdmin ?? false,
    required: requiresSecondFactor({
      isPlatformAdmin: account?.isPlatformAdmin ?? false,
      roles: roles.map((row) => row.role),
    }),
    passkeys: keys?.n ?? 0,
    totp: (totp?.n ?? 0) > 0,
  };
}

/** Faits de la session : compte + date de la deuxième vérification. */
export function toFacts(factors: AccountFactors, verifiedAt: Date | null): SecondFactorFacts {
  return {
    required: factors.required,
    verifiedAt,
    hasFactor: factors.passkeys > 0 || factors.totp,
  };
}

/** Note la deuxième vérification sur une session (repérée par son jeton). */
export async function markSessionVerified(db: Database, token: string): Promise<void> {
  await db
    .update(session)
    .set({ secondFactorVerifiedAt: new Date() })
    .where(eq(session.token, token));
}
