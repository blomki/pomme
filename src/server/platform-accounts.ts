import { sql } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { uuidv7 } from "@/db/uuid";

import { ForbiddenError, SecondFactorRequiredError, UnauthenticatedError } from "./auth/errors";
import { insufficientPrivilege } from "./db-errors";

// Comptes vus depuis l'espace du gestionnaire de la plateforme (story S10b, ADR 0047) : retrouver
// un compte par son email et réinitialiser sa deuxième vérification. Le gestionnaire n'est
// membre d'aucune AMAP : tout passe par deux fonctions de base (migration 0046) qui vérifient
// elles-mêmes qu'il est gestionnaire. Ici, on exige en plus la deuxième vérification de la
// session, que la base ne peut pas connaître.

/** Ce que le gestionnaire voit d'un compte : de quoi reconnaître la personne, rien de plus. */
export type PlatformAccount = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  isPlatformAdmin: boolean;
  hasSecondFactor: boolean;
  amapNames: string[];
};

export type FindAccountResult =
  { status: "found"; account: PlatformAccount } | { status: "not_found" | "invalid" };

export type PlatformResetResult =
  { status: "reset"; userId: string } | { status: "invalid" | "not_found" | "platform_admin" };

const findSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) });
const resetSchema = z.object({ userId: z.uuid() });

function requireVerified(ctx: AmapContext): void {
  if (!ctx.userId) throw new UnauthenticatedError();
  if (!ctx.secondFactorVerified) throw new SecondFactorRequiredError();
}

/** Les fonctions de base refusent toute personne qui n'est pas gestionnaire. */
async function asPlatformAdmin<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (insufficientPrivilege(error)) throw new ForbiddenError();
    throw error;
  }
}

/** Retrouve un compte (non archivé) par son adresse email. Réservé aux gestionnaires. */
export async function findPlatformAccount(
  tx: Transaction,
  ctx: AmapContext,
  input: { email: unknown },
): Promise<FindAccountResult> {
  requireVerified(ctx);
  const parsed = findSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };

  const rows = await asPlatformAdmin(() =>
    tx.execute<{
      user_id: string;
      email: string;
      first_name: string;
      last_name: string;
      is_platform_admin: boolean;
      has_second_factor: boolean;
      amap_names: string[];
    }>(sql`select * from platform_find_account(${parsed.data.email})`),
  );
  const row = rows.rows[0];
  if (!row) return { status: "not_found" };
  return {
    status: "found",
    account: {
      userId: row.user_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      isPlatformAdmin: row.is_platform_admin,
      hasSecondFactor: row.has_second_factor,
      amapNames: row.amap_names,
    },
  };
}

/**
 * Réinitialise la deuxième vérification d'un compte depuis la plateforme : la fonction de base
 * contrôle et écrit le journal de la plateforme, puis `clear` retire les facteurs et ferme les
 * sessions (connexion de Better Auth). S'il échoue, la transaction est annulée : rien n'est
 * journalisé.
 */
export async function resetSecondFactorFromPlatform(
  tx: Transaction,
  ctx: AmapContext,
  input: { userId: unknown },
  clear: (userId: string) => Promise<void>,
): Promise<PlatformResetResult> {
  requireVerified(ctx);
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { userId } = parsed.data;

  const rows = await asPlatformAdmin(() =>
    tx.execute<{ status: "reset" | "not_found" | "platform_admin" }>(
      sql`select platform_reset_second_factor(${userId}, ${uuidv7()}) as status`,
    ),
  );
  const status = rows.rows[0]!.status;
  if (status !== "reset") return { status };
  await clear(userId);
  return { status: "reset", userId };
}
