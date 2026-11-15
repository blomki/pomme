import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { user } from "@/db/schema";

import { emailSchema } from "./auth/request-magic-link";
import { requireRole } from "./auth/require-role";
import { writeAuditLog } from "./audit";
import { uniqueViolation } from "./db-errors";

export const correctEmailSchema = z.object({
  userId: z.uuid(),
  email: emailSchema,
});

export type CorrectEmailResult =
  { status: "corrected"; userId: string } | { status: "invalid" | "same" | "taken" | "forbidden" };

/**
 * Un admin corrige l'email d'un membre de son AMAP qui n'a plus accès à son ancienne adresse
 * (story A1). Journalisé (avant / après). L'adresse n'est plus considérée comme vérifiée.
 *
 * Ce que la base garantit aussi (RLS, politique user_update_by_amap_admin) : la personne
 * appartient à l'AMAP courante (un rôle ou un foyer), et ce n'est pas un gestionnaire de la
 * plateforme.
 * Les sessions de la personne sont fermées ensuite par l'action (connexion pomme_auth).
 */
export async function correctMemberEmail(
  tx: Transaction,
  ctx: AmapContext,
  input: { userId: unknown; email: unknown },
): Promise<CorrectEmailResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = correctEmailSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { userId, email } = parsed.data;

  // Visible seulement si la personne appartient à l'AMAP courante (RLS de user).
  const [target] = await tx
    .select({ email: user.email, isPlatformAdmin: user.isPlatformAdmin })
    .from(user)
    .where(eq(user.id, userId));
  if (!target || target.isPlatformAdmin) return { status: "forbidden" };
  if (target.email === email) return { status: "same" };

  try {
    // Sous-transaction (savepoint) : une adresse déjà prise ne doit pas annuler le reste.
    const updated = await tx.transaction((sub) =>
      sub
        .update(user)
        .set({ email, emailVerified: false, updatedAt: new Date() })
        .where(eq(user.id, userId))
        .returning({ id: user.id }),
    );
    if (updated.length === 0) return { status: "forbidden" };
  } catch (error) {
    if (uniqueViolation(error) !== null) return { status: "taken" };
    throw error;
  }

  await writeAuditLog(tx, ctx, {
    entityType: "user",
    entityId: userId,
    action: "correct_email",
    before: { email: target.email },
    after: { email },
  });
  return { status: "corrected", userId };
}
