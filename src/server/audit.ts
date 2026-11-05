import type { Transaction } from "@/db/client";
import type { AmapContext } from "@/db/context";
import { auditLog } from "@/db/schema";

export type AuditEntry = {
  /** Type de la donnée concernée, nom de sa table : "cheque", "credit_note"… */
  entityType: string;
  entityId: string;
  /** Ce qui a été fait : "create", "update", "archive", "mark_received"… */
  action: string;
  /** État avant et après, pour pouvoir retracer une correction. */
  before?: unknown;
  after?: unknown;
};

/**
 * Écrit une ligne dans le journal (audit_log).
 *
 * Toujours avec la transaction de l'action elle-même : si l'action échoue, la ligne de journal
 * est annulée avec elle ; si l'écriture du journal échoue, l'action est annulée aussi.
 * On n'a donc jamais d'action sans trace, ni de trace sans action.
 */
export async function writeAuditLog(
  tx: Transaction,
  ctx: AmapContext,
  entry: AuditEntry,
): Promise<void> {
  if (!ctx.amapId) throw new Error("Le journal exige une AMAP courante.");
  await tx.insert(auditLog).values({
    amapId: ctx.amapId,
    actorUserId: ctx.userId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
