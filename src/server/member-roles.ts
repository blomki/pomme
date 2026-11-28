import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { amapProducer, amapRole, producer, referentAssignment, user } from "@/db/schema";
import { planMemberRoles } from "@/domain/member-roles";

import { requireRole } from "./auth/require-role";
import { writeAuditLog } from "./audit";

// Fenêtre « Rôles de … » de la fiche d'un foyer (fiche #138) : une case « Administrateur » et
// une case « Référent : <producteur> » par producteur actif. Elle lit et écrit les mêmes données
// que la fiche du producteur (« Enregistrer les référents », C1) : referent_assignment, et le
// rôle « referent » d'amap_role, tenu à jour dans la même transaction.

/** Producteur actif de l'AMAP courante, avec ses référents (identifiants des comptes). */
export type RoleProducer = { amapProducerId: string; name: string; referentIds: string[] };

/** Producteurs actifs de l'AMAP courante, par nom, avec leurs référents. Réservé aux admins. */
export async function listRoleProducers(
  tx: Transaction,
  ctx: AmapContext,
): Promise<RoleProducer[]> {
  await requireRole(tx, ctx, ["admin"]);
  const producers = await tx
    .select({ amapProducerId: amapProducer.id, name: producer.name })
    .from(amapProducer)
    .innerJoin(producer, eq(producer.id, amapProducer.producerId))
    .where(and(eq(amapProducer.active, true), isNull(amapProducer.archivedAt)))
    .orderBy(asc(producer.name));
  if (producers.length === 0) return [];
  const assignments = await tx
    .select({
      amapProducerId: referentAssignment.amapProducerId,
      userId: referentAssignment.userId,
    })
    .from(referentAssignment)
    .where(
      inArray(
        referentAssignment.amapProducerId,
        producers.map((p) => p.amapProducerId),
      ),
    );
  return producers.map((p) => ({
    ...p,
    referentIds: assignments
      .filter((a) => a.amapProducerId === p.amapProducerId)
      .map((a) => a.userId),
  }));
}

export const saveMemberRolesSchema = z.object({
  userId: z.uuid(),
  admin: z.boolean(),
  /** Producteurs (amap_producer) cochés dans la fenêtre. */
  referentOf: z.array(z.uuid()).max(500),
});

export type SaveMemberRolesResult = {
  status: "saved" | "invalid" | "not_found" | "last_admin";
};

/**
 * Enregistre la fenêtre « Rôles » en une seule transaction : rôle d'administrateur, affectations
 * de référent par producteur, et rôle de référent déduit des producteurs suivis (planMemberRoles).
 * Chaque changement est inscrit au journal. Les producteurs inactifs, absents de la fenêtre,
 * gardent leurs affectations.
 */
export async function saveMemberRoles(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
): Promise<SaveMemberRolesResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = saveMemberRolesSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { userId, admin: wantsAdmin } = parsed.data;
  const wanted = [...new Set(parsed.data.referentOf)];

  // Visible seulement si la personne appartient à l'AMAP courante (RLS de user).
  const [person] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId));
  if (!person) return { status: "not_found" };

  // Verrou sur les lignes d'admin : deux retraits simultanés ne peuvent pas laisser l'AMAP sans
  // administrateur (ADR 0009).
  const admins = await tx
    .select({ userId: amapRole.userId })
    .from(amapRole)
    .where(eq(amapRole.role, "admin"))
    .for("update");
  const [referentRole] = await tx
    .select({ id: amapRole.id })
    .from(amapRole)
    .where(and(eq(amapRole.userId, userId), eq(amapRole.role, "referent")));

  const active = await tx
    .select({ id: amapProducer.id })
    .from(amapProducer)
    .where(and(eq(amapProducer.active, true), isNull(amapProducer.archivedAt)));
  const activeIds = new Set(active.map((p) => p.id));
  if (wanted.some((id) => !activeIds.has(id))) return { status: "invalid" };

  const assignments = await tx
    .select({ amapProducerId: referentAssignment.amapProducerId })
    .from(referentAssignment)
    .where(eq(referentAssignment.userId, userId));
  const followed = assignments.map((a) => a.amapProducerId).filter((id) => activeIds.has(id));

  const plan = planMemberRoles({
    isAdmin: admins.some((a) => a.userId === userId),
    wantsAdmin,
    adminCount: admins.length,
    isReferent: referentRole !== undefined,
    followed,
    wanted,
    followedElsewhere: assignments.length - followed.length,
  });
  if (plan.status === "last_admin") return plan;

  const setRole = async (role: "admin" | "referent", change: "grant" | "revoke" | "keep") => {
    if (change === "keep") return;
    if (change === "grant") {
      await tx
        .insert(amapRole)
        .values({ amapId: ctx.amapId!, userId, role, createdBy: ctx.userId })
        .onConflictDoNothing();
    } else {
      await tx.delete(amapRole).where(and(eq(amapRole.userId, userId), eq(amapRole.role, role)));
    }
    await writeAuditLog(tx, ctx, {
      entityType: "amap_role",
      entityId: userId,
      action: change === "grant" ? "grant_role" : "revoke_role",
      after: { role },
    });
  };

  await setRole("admin", plan.admin);
  // Le rôle d'abord, puis les affectations : la fiche du producteur ne propose que des référents.
  if (plan.referent === "grant") await setRole("referent", "grant");
  for (const amapProducerId of plan.assign) {
    await tx.insert(referentAssignment).values({
      amapId: ctx.amapId!,
      amapProducerId,
      userId,
      createdBy: ctx.userId,
    });
    await writeAuditLog(tx, ctx, {
      entityType: "amap_producer",
      entityId: amapProducerId,
      action: "assign_referent",
      after: { userId },
    });
  }
  if (plan.unassign.length > 0) {
    await tx
      .delete(referentAssignment)
      .where(
        and(
          eq(referentAssignment.userId, userId),
          inArray(referentAssignment.amapProducerId, plan.unassign),
        ),
      );
    for (const amapProducerId of plan.unassign) {
      await writeAuditLog(tx, ctx, {
        entityType: "amap_producer",
        entityId: amapProducerId,
        action: "unassign_referent",
        before: { userId },
      });
    }
  }
  if (plan.referent === "revoke") await setRole("referent", "revoke");
  return { status: "saved" };
}
