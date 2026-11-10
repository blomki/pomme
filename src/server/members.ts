import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { amapRole, user } from "@/db/schema";
import type { AmapRoleName } from "@/domain/roles";

import { emailSchema } from "./auth/request-magic-link";
import { requireRole } from "./auth/require-role";
import { writeAuditLog } from "./audit";

export type AmapMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: AmapRoleName[];
};

/**
 * Personnes qui ont un rôle dans l'AMAP courante (admins, référents), par nom.
 * Les foyers s'ajouteront avec la story A2. Réservé aux admins.
 */
export async function listAmapMembers(tx: Transaction, ctx: AmapContext): Promise<AmapMember[]> {
  await requireRole(tx, ctx, ["admin"]);
  const rows = await tx
    .select({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: amapRole.role,
    })
    .from(amapRole)
    .innerJoin(user, eq(user.id, amapRole.userId))
    .orderBy(asc(user.lastName), asc(user.firstName), asc(amapRole.role));

  const members = new Map<string, AmapMember>();
  for (const { role, ...person } of rows) {
    const member = members.get(person.id) ?? { ...person, roles: [] };
    member.roles.push(role);
    members.set(person.id, member);
  }
  return [...members.values()];
}

export const correctEmailSchema = z.object({
  userId: z.uuid(),
  email: emailSchema,
});

export type CorrectEmailResult =
  { status: "corrected"; userId: string } | { status: "invalid" | "same" | "taken" | "forbidden" };

/** Code d'erreur PostgreSQL d'une contrainte d'unicité (ici : email déjà pris). */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } })?.cause ?? error;
  return (cause as { code?: string })?.code === UNIQUE_VIOLATION;
}

/**
 * Un admin corrige l'email d'un membre de son AMAP qui n'a plus accès à son ancienne adresse
 * (story A1). Journalisé (avant / après). L'adresse n'est plus considérée comme vérifiée.
 *
 * Ce que la base garantit aussi (RLS, politique user_update_by_amap_admin) : la personne a un
 * rôle dans l'AMAP courante, et ce n'est pas un gestionnaire de la plateforme.
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

  // Visible seulement si la personne a un rôle dans l'AMAP courante (RLS de user).
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
    if (isUniqueViolation(error)) return { status: "taken" };
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
