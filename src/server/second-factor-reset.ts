import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { user } from "@/db/schema";

import { writeAuditLog } from "./audit";
import { requireRole } from "./auth/require-role";

// Réinitialiser la deuxième vérification d'un membre (story S10, ADR 0041). Jamais par email :
// un autre admin de l'AMAP le fait, après avoir vérifié que c'est bien la personne (de vive
// voix, à la distribution). Elle choisira une nouvelle vérification à sa prochaine connexion.

const resetSchema = z.object({ userId: z.uuid() });

export type ResetSecondFactorResult =
  { status: "reset"; userId: string } | { status: "invalid" | "self" | "forbidden" };

/**
 * Contrôles et journal ; `clear` retire les facteurs et ferme les sessions (connexion de
 * Better Auth). S'il échoue, la transaction est annulée et rien n'est journalisé.
 */
export async function resetMemberSecondFactor(
  tx: Transaction,
  ctx: AmapContext,
  input: { userId: unknown },
  clear: (userId: string) => Promise<void>,
): Promise<ResetSecondFactorResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { userId } = parsed.data;
  // Pas pour soi-même : sinon, qui contrôle la boîte mail d'un admin lui retirerait sa protection.
  if (userId === ctx.userId) return { status: "self" };

  // Visible seulement si la personne appartient à l'AMAP courante (RLS de user). Le compte d'un
  // gestionnaire de la plateforme n'est pas réinitialisable par une AMAP.
  const [target] = await tx
    .select({ isPlatformAdmin: user.isPlatformAdmin, twoFactorEnabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.id, userId));
  if (!target || target.isPlatformAdmin) return { status: "forbidden" };

  await writeAuditLog(tx, ctx, {
    entityType: "user",
    entityId: userId,
    action: "reset_second_factor",
    before: { twoFactorEnabled: target.twoFactorEnabled },
    after: { twoFactorEnabled: false },
  });
  await clear(userId);
  return { status: "reset", userId };
}
