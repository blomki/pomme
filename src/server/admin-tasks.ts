import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { adminTask, household, user } from "@/db/schema";
import {
  membershipProgress,
  splitTasks,
  type AdminTaskDetails,
  type AdminTaskKind,
} from "@/domain/admin-tasks";

import { requireRole } from "./auth/require-role";
import { membershipStates } from "./memberships";

// Tâches « À suivre » du tableau de bord admin (story H3, ADR 0030). L'application les crée au
// moment où quelque chose est à faire (distribution fermée, signalement de la feuille
// d'émargement) ; un admin les coche « Fait », ou les rétablit. Réservées aux admins (requireRole
// et Row Level Security).

/** Une tâche, avec les valeurs de son texte. */
export type FollowUpTaskView = {
  [K in AdminTaskKind]: {
    id: string;
    kind: K;
    relatedId: string;
    details: AdminTaskDetails[K];
    dueDate: string | null;
    createdAt: Date;
    doneAt: Date | null;
    /** Prénom de l'admin qui l'a cochée. */
    doneByName: string | null;
  };
}[AdminTaskKind];

/**
 * Crée la tâche d'un sujet, ou la remet à faire si elle existait déjà (une seule tâche par
 * sujet : pas de doublon). Appelée depuis une action admin, dans sa transaction ; la Row Level
 * Security refuse toute autre personne.
 */
export async function addFollowUpTask<K extends AdminTaskKind>(
  tx: Transaction,
  ctx: AmapContext,
  task: { kind: K; relatedId: string; details: AdminTaskDetails[K]; dueDate?: string | null },
): Promise<void> {
  const values = { details: task.details, dueDate: task.dueDate ?? null };
  await tx
    .insert(adminTask)
    .values({ amapId: ctx.amapId!, kind: task.kind, relatedId: task.relatedId, ...values })
    .onConflictDoUpdate({
      target: [adminTask.amapId, adminTask.kind, adminTask.relatedId],
      set: { ...values, doneAt: null, doneBy: null, archivedAt: null },
    });
}

/**
 * Retire la tâche d'un sujet qui n'a plus lieu d'être (distribution rouverte…) : archivée,
 * jamais supprimée. Une tâche déjà faite reste dans les tâches terminées.
 */
export async function dropFollowUpTask(
  tx: Transaction,
  ctx: AmapContext,
  task: { kind: AdminTaskKind; relatedId: string },
): Promise<void> {
  await tx
    .update(adminTask)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(adminTask.kind, task.kind),
        eq(adminTask.relatedId, task.relatedId),
        isNull(adminTask.doneAt),
        isNull(adminTask.archivedAt),
      ),
    );
}

/** Tâches à faire, puis tâches terminées (les plus récentes). */
export async function listFollowUpTasks(
  tx: Transaction,
  ctx: AmapContext,
): Promise<{ todo: FollowUpTaskView[]; done: FollowUpTaskView[] }> {
  await requireRole(tx, ctx, ["admin"]);
  const rows = await tx
    .select({
      id: adminTask.id,
      kind: adminTask.kind,
      relatedId: adminTask.relatedId,
      details: adminTask.details,
      dueDate: adminTask.dueDate,
      createdAt: adminTask.createdAt,
      doneAt: adminTask.doneAt,
      doneByName: user.firstName,
    })
    .from(adminTask)
    .leftJoin(user, eq(user.id, adminTask.doneBy))
    .where(isNull(adminTask.archivedAt));
  return splitTasks(rows as FollowUpTaskView[]);
}

export type MarkTaskResult = { status: "saved" | "not_found" | "invalid" };

/** Coche une tâche « Fait », ou la rétablit (« Rétablir »). */
export async function markTaskDone(
  tx: Transaction,
  ctx: AmapContext,
  input: unknown,
  now = new Date(),
): Promise<MarkTaskResult> {
  await requireRole(tx, ctx, ["admin"]);
  const parsed = z.object({ taskId: z.uuid(), done: z.boolean() }).safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const updated = await tx
    .update(adminTask)
    .set(parsed.data.done ? { doneAt: now, doneBy: ctx.userId! } : { doneAt: null, doneBy: null })
    .where(and(eq(adminTask.id, parsed.data.taskId), isNull(adminTask.archivedAt)))
    .returning({ id: adminTask.id });
  return { status: updated.length > 0 ? "saved" : "not_found" };
}

/** Avancement des adhésions : foyers adhérents, adhésions qui expirent bientôt (story H3). */
export async function getMembershipProgress(
  tx: Transaction,
  ctx: AmapContext,
  now = new Date(),
): Promise<ReturnType<typeof membershipProgress>> {
  await requireRole(tx, ctx, ["admin"]);
  const households = await tx
    .select({ id: household.id })
    .from(household)
    .where(isNull(household.archivedAt));
  const states = await membershipStates(
    tx,
    ctx,
    households.map((h) => h.id),
    now,
  );
  return membershipProgress([...states.values()].map((s) => s.status));
}
